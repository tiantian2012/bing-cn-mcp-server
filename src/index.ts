#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

// 加载环境变量
dotenv.config();

// 配置默认用户代理
const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 定义搜索结果类型
interface SearchResult {
  id: string;
  title: string;
  link: string;
  snippet: string;
}

// 全局变量存储搜索结果，这样可以通过ID引用
const searchResults = new Map<string, SearchResult>();

/**
 * 必应搜索函数
 * @param {string} query - 搜索关键词
 * @param {number} numResults - 返回结果数量
 * @returns {Promise<Array<SearchResult>>} 搜索结果数组
 */
async function searchBing(query: string, numResults: number): Promise<SearchResult[]> {
  try {
    // 构建必应搜索URL，添加中文支持参数
    const searchUrl = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN&ensearch=0`;
    console.error(`正在搜索URL: ${searchUrl}`);
    
    // 设置请求头，模拟浏览器
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Cookie': 'SRCHHPGUSR=SRCHLANG=zh-Hans; _EDGE_S=ui=zh-cn; _EDGE_V=1'
    };
    
    // 发送请求
    const response = await axios.get(searchUrl, { 
      headers,
      timeout: 15000 // 增加超时时间
    });
    console.error(`搜索响应状态: ${response.status}`);
    
    // 调试：保存响应内容到日志
    console.error(`响应内容长度: ${response.data.length} 字节`);
    const snippetSize = 200;
    console.error(`响应内容前 ${snippetSize} 字符: ${response.data.substring(0, snippetSize)}`);
    
    // 使用 Cheerio 解析 HTML
    const $ = cheerio.load(response.data);
    
    // 找到搜索结果列表
    const results: SearchResult[] = [];
    
    // 调试：打印页面上找到的搜索结果数量
    const totalElements = $('#b_results > li').length;
    console.error(`找到 ${totalElements} 个搜索结果元素 (b_results > li)`);
    
    // 检查特定元素
    ['#b_results', '.b_algo', '.b_title', '.b_caption'].forEach(selector => {
      console.error(`选择器 ${selector} 匹配了 ${$(selector).length} 个元素`);
    });
    
    // 更新选择器列表，针对中文必应结果优化
    const resultSelectors = [
      '#b_results > li.b_algo',
      '#b_results > .b_ans',
      '#b_results > li'
    ];
    
    for (const selector of resultSelectors) {
      console.error(`尝试选择器: ${selector}`);
      $(selector).each((index, element) => {
        if (results.length >= numResults) return false;
        
        // 打印当前元素的HTML以便调试
        const elementHtml = $(element).html()?.substring(0, 100);
        console.error(`元素 ${index} HTML 片段: ${elementHtml}`);
        
        // 尝试多种方式提取标题
        let title = '';
        let link = '';
        
        // 查找标题和链接
        const titleElement = $(element).find('h2 a').first();
        if (titleElement.length) {
          title = titleElement.text().trim();
          link = titleElement.attr('href') || '';
        }
        
        // 如果没找到标题，尝试其他选择器
        if (!title) {
          const altTitleElement = $(element).find('.b_title a, a.tilk, a strong').first();
          if (altTitleElement.length) {
            title = altTitleElement.text().trim();
            link = altTitleElement.attr('href') || '';
          }
        }
        
        // 获取摘要
        let snippet = '';
        const snippetElement = $(element).find('.b_caption p, .b_snippet, .b_algoSlug').first();
        if (snippetElement.length) {
          snippet = snippetElement.text().trim();
        }
        
        // 如果还没找到摘要，尝试使用整个元素内容截取
        if (!snippet) {
          snippet = $(element).text().trim();
          // 移除标题部分
          if (title && snippet.includes(title)) {
            snippet = snippet.replace(title, '').trim();
          }
          // 截取摘要长度
          if (snippet.length > 150) {
            snippet = snippet.substring(0, 150) + '...';
          }
        }
        
        // 如果链接不完整，修复链接
        if (link && !link.startsWith('http')) {
          if (link.startsWith('/')) {
            link = `https://cn.bing.com${link}`;
          } else {
            link = `https://cn.bing.com/${link}`;
          }
        }
        
        // 如果标题和摘要都是空的，或者是广告，跳过这个结果
        if ((!title && !snippet) || $(element).hasClass('b_ad')) return;
        
        // 创建唯一ID
        const id = `result_${Date.now()}_${index}`;
        
        // 调试输出
        console.error(`找到结果 ${index}: 标题="${title}", 链接="${link.substring(0, 30)}..."`);
        
        // 保存到结果映射中
        const result: SearchResult = { id, title, link, snippet };
        searchResults.set(id, result);
        
        results.push(result);
      });
      
      // 如果已经找到了足够的结果，就不再尝试其他选择器
      if (results.length > 0) {
        console.error(`使用选择器 ${selector} 找到了 ${results.length} 个结果，停止继续搜索`);
        break;
      }
    }
    
    // 如果仍然没有找到结果，尝试提取任何可能的链接作为结果
    if (results.length === 0) {
      console.error('使用选择器未找到结果，尝试直接提取链接');
      
      $('a').each((index, element) => {
        if (results.length >= numResults) return false;
        
        const $el = $(element);
        const title = $el.text().trim();
        const link = $el.attr('href') || '';
        
        // 跳过导航链接、空链接或JavaScript链接
        if (!title || !link || link === '#' || link.startsWith('javascript:')) return;
        
        // 确保链接是完整的URL
        let fullLink = link;
        if (!link.startsWith('http')) {
          if (link.startsWith('/')) {
            fullLink = `https://cn.bing.com${link}`;
          } else {
            fullLink = `https://cn.bing.com/${link}`;
          }
        }
        
        // 如果链接包含查询关键词，更有可能是搜索结果
        const isLikelyResult = fullLink.includes('bing.com/search') || 
                               title.toLowerCase().includes(query.toLowerCase()) ||
                               fullLink.toLowerCase().includes(query.toLowerCase());
        
        if (isLikelyResult) {
          const id = `result_${Date.now()}_link_${index}`;
          const snippet = `来自 ${fullLink} 的结果`;
          
          console.error(`提取到可能的结果链接: ${title} - ${fullLink}`);
          
          const result: SearchResult = { id, title, link: fullLink, snippet };
          searchResults.set(id, result);
          results.push(result);
        }
      });
    }
    
    // 如果仍然没有找到结果，添加一个通用结果
    if (results.length === 0) {
      console.error('未找到任何结果，添加原始搜索链接作为结果');
      
      const id = `result_${Date.now()}_fallback`;
      const result: SearchResult = {
        id,
        title: `搜索结果: ${query}`,
        link: searchUrl,
        snippet: `未能解析关于 "${query}" 的搜索结果，但您可以直接访问必应搜索页面查看。`
      };
      
      searchResults.set(id, result);
      results.push(result);
    }
    
    console.error(`最终返回 ${results.length} 个结果`);
    return results;
  } catch (error) {
    console.error('必应搜索出错:', error);
    if (axios.isAxiosError(error)) {
      console.error(`HTTP错误状态码: ${error.response?.status}`);
      console.error(`错误响应数据: ${JSON.stringify(error.response?.data || '无数据')}`);
    }
    
    // 出错时返回一个错误信息作为结果
    const id = `error_${Date.now()}`;
    const errorResult: SearchResult = {
      id,
      title: `搜索 "${query}" 时出错`,
      link: `https://cn.bing.com/search?q=${encodeURIComponent(query)}`,
      snippet: `搜索过程中发生错误: ${error instanceof Error ? error.message : '未知错误'}`
    };
    
    searchResults.set(id, errorResult);
    return [errorResult];
  }
}

/**
 * 获取网页内容函数
 * @param {string} resultId - 搜索结果ID
 * @returns {Promise<string>} 网页内容
 */
async function fetchWebpageContent(resultId: string): Promise<string> {
  try {
    // 从搜索结果映射中获取URL
    const result = searchResults.get(resultId);
    if (!result) {
      throw new Error(`找不到ID为 ${resultId} 的搜索结果`);
    }
    
    const url = result.link;
    console.error(`正在获取网页内容: ${url}`);
    
    // 设置请求头，模拟浏览器
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': 'https://cn.bing.com/'
    };
    
    // 发送请求获取网页内容
    const response = await axios.get(url, { 
      headers,
      timeout: 15000,
      responseType: 'arraybuffer' // 使用arraybuffer以便正确处理各种编码
    });
    
    console.error(`获取网页响应状态: ${response.status}`);
    
    // 检测编码并正确解码内容
    let html = '';
    const contentType = response.headers['content-type'] || '';
    let encoding = 'utf-8';
    
    // 从Content-Type头部尝试获取字符集
    const charsetMatch = contentType.match(/charset=([^;]+)/i);
    if (charsetMatch && charsetMatch[1]) {
      encoding = charsetMatch[1].trim();
      console.error(`从Content-Type检测到编码: ${encoding}`);
    }
    
    try {
      // 尝试使用检测到的编码解码
      const decoder = new TextDecoder(encoding);
      html = decoder.decode(response.data);
    } catch (decodeError) {
      console.error(`使用 ${encoding} 解码失败，回退到UTF-8: ${decodeError}`);
      // 如果解码失败，回退到UTF-8
      const decoder = new TextDecoder('utf-8');
      html = decoder.decode(response.data);
    }
    
    // 使用 Cheerio 解析 HTML
    const $ = cheerio.load(html);
    
    // 移除不需要的元素
    $('script, style, iframe, noscript, nav, header, footer, .header, .footer, .nav, .sidebar, .ad, .advertisement, #header, #footer, #nav, #sidebar').remove();
    
    // 获取页面主要内容
    // 尝试找到主要内容区域
    let content = '';
    const mainSelectors = [
      'main', 'article', '.article', '.post', '.content', '#content', 
      '.main', '#main', '.body', '#body', '.entry', '.entry-content',
      '.post-content', '.article-content', '.text', '.detail'
    ];
    
    for (const selector of mainSelectors) {
      const mainElement = $(selector);
      if (mainElement.length > 0) {
        content = mainElement.text().trim();
        console.error(`使用选择器 "${selector}" 找到内容，长度: ${content.length} 字符`);
        break;
      }
    }
    
    // 如果没有找到主要内容区域，则尝试查找所有段落
    if (!content || content.length < 100) {
      console.error('未找到主要内容区域，尝试提取所有段落');
      const paragraphs: string[] = [];
      $('p').each((_, element) => {
        const text = $(element).text().trim();
        if (text.length > 20) { // 只保留有意义的段落
          paragraphs.push(text);
        }
      });
      
      if (paragraphs.length > 0) {
        content = paragraphs.join('\n\n');
        console.error(`从段落中提取到内容，长度: ${content.length} 字符`);
      }
    }
    
    // 如果仍然没有找到内容，则获取 body 内容
    if (!content || content.length < 100) {
      console.error('从段落中未找到足够内容，获取body内容');
      content = $('body').text().trim();
    }
    
    // 清理文本
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
    
    // 添加标题
    const title = $('title').text().trim();
    if (title) {
      content = `标题: ${title}\n\n${content}`;
    }
    
    // 如果内容过长，则截取一部分
    const maxLength = 8000;
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '... (内容已截断)';
    }
    
    console.error(`最终提取内容长度: ${content.length} 字符`);
    return content;
  } catch (error) {
    console.error('获取网页内容出错:', error);
    if (axios.isAxiosError(error)) {
      console.error(`HTTP错误状态码: ${error.response?.status}`);
      console.error(`错误响应数据: ${error.response?.headers['content-type']}`);
    }
    throw new Error(`获取网页内容失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// 创建 MCP 服务器实例
const server = new McpServer({
  name: "bing-search",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {}
  }
});

// 注册必应搜索工具
server.tool(
  "bing_search",
  "使用必应搜索指定的关键词，并返回搜索结果列表，包括标题、链接、摘要和ID",
  {
    query: z.string().describe("搜索关键词"),
    num_results: z.number().default(5).describe("返回的结果数量，默认为5")
  },
  async ({ query, num_results }) => {
    try {
      // 调用必应搜索
      const results = await searchBing(query, num_results);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error('搜索出错:', error);
      return {
        content: [
          {
            type: "text",
            text: `搜索失败: ${error instanceof Error ? error.message : '未知错误'}`
          }
        ]
      };
    }
  }
);

// 注册网页内容抓取工具
server.tool(
  "fetch_webpage",
  "根据提供的ID获取对应网页的内容",
  {
    result_id: z.string().describe("从bing_search返回的结果ID")
  },
  async ({ result_id }) => {
    try {
      // 获取网页内容
      const content = await fetchWebpageContent(result_id);
      
      return {
        content: [
          {
            type: "text",
            text: content
          }
        ]
      };
    } catch (error) {
      console.error('获取网页内容出错:', error);
      return {
        content: [
          {
            type: "text",
            text: `获取网页内容失败: ${error instanceof Error ? error.message : '未知错误'}`
          }
        ]
      };
    }
  }
);

// 运行服务器
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("必应搜索 MCP 服务器已启动");
  } catch (error) {
    console.error("服务器启动失败:", error);
    process.exit(1);
  }
}

main();