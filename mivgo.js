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
    return name.replace(/超清|4K/g, '').trim();
}

function processInterfaceFile(content) {
    const lines = content.split('\n');
    const header = [];
    const channelMap = new Map();
    const urlSet = new Set();

    let i = 0;

    while (i < lines.length && (lines[i].startsWith('#EXTM3U') || lines[i].startsWith('#EXT-X-'))) {
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
        const displayNameMatch = line.match(/,([^,\n]+)$/);
        const displayName = displayNameMatch ? displayNameMatch[1] : '';

        if (group === '超清频道') {
            const cleanedName = cleanChannelName(displayName);
            const normalizedName = normalizeCCTVName(cleanedName);

            if (normalizedName.startsWith('CCTV-')) {
                group = '央视频道';
            } else if (isSatelliteChannel(normalizedName)) {
                group = '卫视频道';
            } else {
                i += 2;
                continue;
            }

            const newLine = line.replace(`group-title="超清频道"`, `group-title="${group}"`)
                               .replace(/,([^,\n]+)$/, `,${normalizedName}`)
                               .replace(/tvg-id="[^"]*"/, `tvg-id="${normalizedName}"`)
                               .replace(/tvg-name="[^"]*"/, `tvg-name="${normalizedName}"`);

            const url = lines[i + 1] || '';
            if (!url || !url.startsWith('http')) {
                i += 2;
                continue;
            }

            const key = normalizedName + group;
            if (!channelMap.has(key)) {
                channelMap.set(key, []);
            }
            if (!urlSet.has(url)) {
                urlSet.add(url);
                channelMap.get(key).push({
                    extinf: newLine,
                    url: url
                });
            }
        } else {
            const normalizedName = normalizeCCTVName(displayName);
            const newLine = line.replace(/,([^,\n]+)$/, `,${normalizedName}`)
                               .replace(/tvg-id="[^"]*"/, `tvg-id="${normalizedName}"`)
                               .replace(/tvg-name="[^"]*"/, `tvg-name="${normalizedName}"`);

            const url = lines[i + 1] || '';
            if (!url || !url.startsWith('http')) {
                i += 2;
                continue;
            }

            const key = normalizedName + group;
            if (!channelMap.has(key)) {
                channelMap.set(key, []);
            }
            if (!urlSet.has(url)) {
                urlSet.add(url);
                channelMap.get(key).push({
                    extinf: newLine,
                    url: url
                });
            }
        }
        i += 2;
    }

    function isSatelliteChannel(name) {
        const satelliteChannels = [
            '浙江卫视', '江苏卫视', '东方卫视', '广东卫视', '北京卫视',
            '湖北卫视', '辽宁卫视', '东南卫视', '吉林卫视', '江西卫视',
            '湖南卫视', '山东卫视', '四川卫视', '重庆卫视', '天津卫视',
            '安徽卫视', '黑龙江卫视', '河北卫视', '河南卫视', '山西卫视',
            '陕西卫视', '甘肃卫视', '云南卫视', '贵州卫视', '广西卫视',
            '新疆卫视', '宁夏卫视', '青海卫视', '西藏卫视', '内蒙古卫视',
            '兵团卫视', '三沙卫视', '海南卫视', '旅游卫视'
        ];
        return satelliteChannels.some(ch => name.includes(ch) || ch.includes(name));
    }

    const outputLines = [...header];

    const sortedGroups = ['央视频道', '卫视频道'];
    const allGroupsInMap = [...new Set([...channelMap.keys()].map(k => {
        for (const g of [...sortedGroups]) {
            if (k.endsWith(g)) return g;
        }
        return k.split(groupSeparator(k))[1] || '其他';
    }))]
        .filter(g => g !== '其他');

    const allGroups = [...sortedGroups, ...allGroupsInMap];

    function groupSeparator(key) {
        const groups = ['央视频道', '卫视频道', '广东地区', '浙江地区', '黑龙江地区', '江苏地区', '北京地区'];
        for (const g of groups) {
            if (key.endsWith(g)) return key.slice(0, -g.length);
        }
        return '';
    }

    for (const group of allGroups) {
        const groupChannels = [...channelMap.entries()]
            .filter(([key]) => key.endsWith(group))
            .map(([key, value]) => ({ name: groupSeparator(key).trim(), urls: value }))
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
