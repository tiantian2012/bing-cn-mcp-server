# 必应搜索 MCP 服务器

这是一个基于 Model Context Protocol (MCP) 的服务器，提供两个主要工具：
1. 必应搜索工具 - 抓取必应搜索结果
2. 网页内容抓取工具 - 获取指定网页的内容

该服务器不依赖任何外部 API，而是通过网页抓取的方式获取数据。

## 功能特点

- 抓取必应搜索结果，包括标题、链接、摘要
- 通过 ID 引用抓取特定搜索结果的网页内容
- 模拟浏览器请求，降低被屏蔽风险
- 与 Claude 或其他支持 MCP 的 AI 模型无缝集成

## 安装和使用

### 前提条件

- Node.js 16.0 或更高版本
- npm 包管理器

### 安装步骤

1. 克隆仓库或下载源代码

2. 安装依赖
```bash
npm install
```

3. 构建项目
```bash
npm run build
```

4. 配置环境变量
```bash
# 复制示例环境文件（Windows）
copy .env.example .env
```
然后编辑 `.env` 文件，设置必要的环境变量。

### 在 Claude Desktop 中使用

1. 确保您已安装 [Claude Desktop](https://claude.ai/download)

2. 编辑 Claude Desktop 配置文件
   - 在 Windows 系统中，该文件位于：`%AppData%\Claude\claude_desktop_config.json`
   - 如果文件不存在，请创建它

3. 配置 Claude Desktop 使用您的 MCP 服务器：
```json
{
    "mcpServers": {
        "bing-search": {
            "command": "node",
            "args": [
                "D:\\path\\to\\your\\project\\build\\index.js"
            ]
        }
    }
}
```
请确保将路径替换为您项目的实际路径。

4. 重启 Claude Desktop

5. 现在，您应该可以在 Claude Desktop 界面中看到一个锤子图标，表示可以使用 MCP 工具。

## 工具使用说明

### 1. 必应搜索 (bing_search)

搜索必应并返回结果列表。

参数:
- `query`: 搜索关键词
- `num_results`: 要返回的结果数量 (默认为5)

返回:
包含以下字段的结果列表:
- `id`: 结果 ID，用于后续内容抓取
- `title`: 页面标题
- `link`: 页面 URL
- `snippet`: 结果摘要

### 2. 网页内容抓取 (fetch_webpage)

根据之前搜索返回的 ID 获取网页内容。

参数:
- `result_id`: 从 bing_search 返回的结果 ID

返回:
- 网页提取的文本内容

## 故障排除

- **问题**: Claude Desktop 找不到 MCP 服务器
  **解决方案**: 确保您的配置路径正确，并重启 Claude Desktop

- **问题**: 构建项目时出错
  **解决方案**: 确保已安装所有依赖，并且 Node.js 版本正确

- **问题**: 工具不返回预期结果
  **解决方案**: 检查控制台错误信息，或者调整请求头以避免被屏蔽

## 注意事项

- 网页抓取可能受到目标网站的限制，如遇到问题，请调整请求头或使用代理
- 为避免过多请求，服务器不会缓存搜索结果
- 抓取的网页内容可能会被截断，以避免内容过长

## 许可证

MIT 