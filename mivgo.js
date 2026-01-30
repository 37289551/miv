import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const inputFilePath = resolve('./interface.txt');
const outputFilePath = resolve('./mivgo.m3u');

function normalizeCCTVName(name) {
    const cctvMatch = name.match(/^CCTV(\d+[+]?)/);
    if (cctvMatch) {
        return `CCTV-${cctvMatch[1]}`;
    }
    return name;
}

function cleanChannelName(name) {
    return name.replace(/超清|4K/g, '');
}

function processInterfaceFile(content) {
    const lines = content.split('\n');
    const header = [];
    const channels = [];
    const channelMap = new Map();

    let i = 0;

    while (i < lines.length && lines[i].startsWith('#')) {
        header.push(lines[i]);
        i++;
    }

    while (i < lines.length) {
        const line = lines[i];

        if (!line.startsWith('#EXTINF')) {
            i++;
            continue;
        }

        const match = line.match(/group-title="([^"]+)"/);
        if (!match) {
            i++;
            continue;
        }

        let group = match[1];
        const nameMatch = line.match(/tvg-id="([^"]+)"/);
        const name = nameMatch ? nameMatch[1] : '';

        if (group === '超清频道') {
            const cleanedName = cleanChannelName(name);
            const normalizedName = normalizeCCTVName(cleanedName);

            if (normalizedName.startsWith('CCTV-')) {
                group = '央视频道';
            } else if (lines.some(l => l.includes(normalizedName) && l.includes('卫视频道'))) {
                group = '卫视频道';
            } else {
                i += 2;
                continue;
            }

            const newLine = line.replace(`group-title="超清频道"`, `group-title="${group}"`)
                               .replace(/>[^,]+,/, `>${normalizedName},`)
                               .replace(/tvg-id="[^"]*"/, `tvg-id="${normalizedName}"`)
                               .replace(/tvg-name="[^"]*"/, `tvg-name="${normalizedName}"`);

            if (!channelMap.has(normalizedName + group)) {
                channelMap.set(normalizedName + group, []);
            }
            channelMap.get(normalizedName + group).push({
                extinf: newLine,
                url: lines[i + 1] || ''
            });
        } else {
            const normalizedName = normalizeCCTVName(name);
            const newLine = line.replace(/>[^,]+,/, `>${normalizedName},`)
                               .replace(/tvg-id="[^"]*"/, `tvg-id="${normalizedName}"`)
                               .replace(/tvg-name="[^"]*"/, `tvg-name="${normalizedName}"`);

            if (!channelMap.has(normalizedName + group)) {
                channelMap.set(normalizedName + group, []);
            }
            channelMap.get(normalizedName + group).push({
                extinf: newLine,
                url: lines[i + 1] || ''
            });
        }
        i += 2;
    }

    const outputLines = [...header];

    const sortedGroups = ['央视频道', '卫视频道'];
    const otherGroups = [...new Set([...channelMap.keys()].map(k => k.slice(-10).trim()))]
        .filter(g => g !== '央视频道' && g !== '卫视频道');

    const allGroups = [...sortedGroups, ...otherGroups];

    for (const group of allGroups) {
        const groupChannels = [...channelMap.entries()]
            .filter(([key]) => key.endsWith(group))
            .map(([key, value]) => ({ name: key.slice(0, -group.length).trim(), urls: value }))
            .filter(item => item.name);

        if (groupChannels.length === 0) continue;

        for (const channel of groupChannels) {
            for (const entry of channel.urls) {
                outputLines.push(entry.extinf);
                outputLines.push(entry.url);
            }
        }
    }

    return outputLines.join('\n');
}

function main() {
    try {
        const content = readFileSync(inputFilePath, 'utf-8');
        const processedContent = processInterfaceFile(content);
        writeFileSync(outputFilePath, processedContent, 'utf-8');
        console.log('✓ 处理完成，文件已保存到:', outputFilePath);
    } catch (error) {
        console.error('✗ 处理失败:', error.message);
        process.exit(1);
    }
}

main();
