import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const hdRepoPath = resolve('./HD/output/result.m3u');
const mivgoPath = resolve('./mivgo.m3u');
const outputPath = resolve('./result.m3u');

function parseM3U(content) {
    const lines = content.split('\n');
    const header = [];
    const channels = [];

    let i = 0;

    // 读取头部
    while (i < lines.length && (lines[i].startsWith('#EXTM3U') || lines[i].startsWith('#EXT-X-'))) {
        header.push(lines[i]);
        i++;
    }

    // 读取频道
    while (i < lines.length) {
        const line = lines[i];

        if (!line.startsWith('#EXTINF')) {
            i++;
            continue;
        }

        const groupMatch = line.match(/group-title="([^"]+)"/);
        const nameMatch = line.match(/,([^,\n]+)$/);
        const displayName = nameMatch ? nameMatch[1] : '';
        const group = groupMatch ? groupMatch[1] : '';

        channels.push({
            group,
            name: displayName,
            extinf: line,
            url: lines[i + 1] || ''
        });

        i += 2;
    }

    return { header, channels };
}

function buildM3U(header, channels) {
    const lines = [...header];

    for (const channel of channels) {
        lines.push(channel.extinf);
        lines.push(channel.url);
    }

    return lines.join('\n');
}

function main() {
    try {
        console.log('读取 HD 仓库文件...');
        const hdContent = readFileSync(hdRepoPath, 'utf-8');
        const hdData = parseM3U(hdContent);

        console.log('读取 mivgo.m3u 文件...');
        const mivgoContent = readFileSync(mivgoPath, 'utf-8');
        const mivgoData = parseM3U(mivgoContent);

        // 提取 mivgo 的央视和卫视频道
        const mivgoCCTVChannels = mivgoData.channels
            .filter(ch => ch.group === '央视频道')
            .reduce((acc, ch) => {
                if (!acc.has(ch.name)) {
                    acc.set(ch.name, []);
                }
                if (acc.get(ch.name).length < 2) {
                    acc.get(ch.name).push(ch);
                }
                return acc;
            }, new Map());

        const mivgoSatelliteChannels = mivgoData.channels
            .filter(ch => ch.group === '卫视频道')
            .reduce((acc, ch) => {
                if (!acc.has(ch.name)) {
                    acc.set(ch.name, []);
                }
                if (acc.get(ch.name).length < 2) {
                    acc.get(ch.name).push(ch);
                }
                return acc;
            }, new Map());

        console.log(`找到 ${mivgoCCTVChannels.size} 个央视频道`);
        console.log(`找到 ${mivgoSatelliteChannels.size} 个卫视频道`);

        // 构建新的频道列表
        const newChannels = [];
        const processedNames = new Set();

        for (const channel of hdData.channels) {
            const key = channel.name;
            const isCCTV = channel.group === '央视频道';
            const isSatellite = channel.group === '卫视频道';

            if ((isCCTV && mivgoCCTVChannels.has(key)) || 
                (isSatellite && mivgoSatelliteChannels.has(key))) {
                
                const mivgoChannels = isCCTV ? mivgoCCTVChannels : mivgoSatelliteChannels;

                if (!processedNames.has(key)) {
                    // 覆盖前1-2条线路
                    const replacementChannels = mivgoChannels.get(key);
                    newChannels.push(...replacementChannels);
                    processedNames.add(key);

                    // 保留 HD 的其他线路
                    const remainingChannels = hdData.channels
                        .filter(ch => ch.name === key && ch.group === channel.group)
                        .slice(replacementChannels.length);

                    newChannels.push(...remainingChannels);
                }
            } else {
                newChannels.push(channel);
            }
        }

        const outputContent = buildM3U(hdData.header, newChannels);
        writeFileSync(outputPath, outputContent, 'utf-8');

        console.log('✓ 处理完成，文件已保存到当前仓库:', outputPath);
        console.log('✓ 原始频道数:', hdData.channels.length);
        console.log('✓ 更新后频道数:', newChannels.length);

    } catch (error) {
        console.error('✗ 处理失败:', error.message);
        process.exit(1);
    }
}

main();
