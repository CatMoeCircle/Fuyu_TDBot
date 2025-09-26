import logger from "../../log/index.ts";
import type { ProxyType$Input } from "tdlib-types";
import type { Client } from "tdl";

/**
 * 获取当前配置的所有代理列表
 *
 * @param client - TDLib 客户端实例
 * @returns 返回包含所有代理配置的对象数组，如果出错则返回null
 *
 */
export async function getProxies(client: Client) {
  try {
    const proxies = await client.invoke({
      _: "getProxies",
    });
    return proxies;
  } catch (error) {
    logger.error("getProxies Error:", error);
    throw new Error("获取代理列表失败", { cause: error });
  }
}

/**
 * 向TDLib客户端添加代理配置
 *
 * 支持的协议: socks5, http, mtproto
 *
 * @param client - TDLib 客户端实例
 *
 * @param proxyUrl - 代理的URL，格式为 protocol://[username:password@]host:port
 *
 * @returns  来自TDLib API的结果对象，如果出错则返回null
 *
 * @throws 如果代理协议不受支持
 *
 * @example
 * // 添加SOCKS5代理
 * addProxy("socks5://user:pass@example.com:1080");
 *
 * // 添加HTTP代理
 * addProxy("http://user:pass@example.com:8080");
 *
 * // 添加MTProto代理（密钥作为用户名传递）
 * addProxy("mtproto://secret@example.com:443");
 */
export async function addProxy(
  client: Client,
  proxyUrl: string,
  http_only = false
) {
  try {
    const url = new URL(proxyUrl);
    const [username, password] = url.username
      ? [url.username, url.password]
      : [undefined, undefined];
    let proxyType: ProxyType$Input;

    if (url.protocol === "socks5:") {
      proxyType = {
        _: "proxyTypeSocks5",
        username: username,
        password: password,
      };
    } else if (url.protocol === "http:") {
      proxyType = {
        _: "proxyTypeHttp",
        username: username,
        password: password,
        http_only: http_only,
      };
    } else if (url.protocol === "mtproto:") {
      proxyType = {
        _: "proxyTypeMtproto",
        secret: username,
      };
    } else {
      throw new Error("Unsupported proxy protocol");
    }

    const proxy = {
      server: url.hostname,
      port: parseInt(url.port, 10),
      enable: true,
      type: proxyType,
    };

    const result = await client.invoke({
      _: "addProxy",
      server: proxy.server,
      port: proxy.port,
      enable: proxy.enable,
      type: proxy.type,
    });

    return result;
  } catch (error) {
    logger.error("addProxy Error:", error);
    throw new Error("添加代理失败", { cause: error });
  }
}

/**
 * 从TDLib客户端中移除代理配置
 *
 * @param client - TDLib 客户端实例
 * @param proxy_id - 要移除的代理ID，可以通过getProxies()获取
 * @returns 返回 object_ptr<Ok> 表示操作成功，失败返回null
 *
 */
export async function removeProxy(client: Client, proxy_id: number) {
  try {
    const result = await client.invoke({
      _: "removeProxy",
      proxy_id: proxy_id,
    });
    return result;
  } catch (error) {
    logger.error("removeProxy Error:", error);
    throw new Error("移除代理失败", { cause: error });
  }
}

/**
 * 编辑现有的代理配置
 *
 * @param client - TDLib 客户端实例
 * @param proxyId - 要编辑的代理ID
 * @param server - 代理服务器地址
 * @param port - 代理服务器端口
 * @param enable - 是否启用代理
 * @param proxyType - 代理类型配置
 * @returns 返回编辑后的代理对象
 */
export async function editProxy(
  client: Client,
  proxy_id: number,
  server: string,
  port: number,
  enable: boolean,
  proxyType: ProxyType$Input
) {
  try {
    const result = await client.invoke({
      _: "editProxy",
      proxy_id: proxy_id,
      server: server,
      port: port,
      enable: enable,
      type: proxyType,
    });
    return result;
  } catch (error) {
    logger.error("editProxy Error:", error);
    throw new Error("编辑代理失败", { cause: error });
  }
}

/**
 * 启用指定代理
 *
 * @param client - TDLib 客户端实例
 * @param proxy_id - 要启用的代理ID
 * @returns 返回 object_ptr<Ok> 表示操作成功
 */
export async function enableProxy(client: Client, proxy_id: number) {
  try {
    const result = await client.invoke({
      _: "enableProxy",
      proxy_id: proxy_id,
    });
    return result;
  } catch (error) {
    logger.error("enableProxy Error:", error);
    throw new Error("启用代理失败", { cause: error });
  }
}

/**
 * 禁用当前启用的代理
 *
 * @param client - TDLib 客户端实例
 * @returns 返回 object_ptr<Ok> 表示操作成功
 */
export async function disableProxy(client: Client) {
  try {
    const result = await client.invoke({
      _: "disableProxy",
    });
    return result;
  } catch (error) {
    logger.error("disableProxy Error:", error);
    throw new Error("禁用代理失败", { cause: error });
  }
}

/**
 * 测量到代理服务器的往返延迟时间
 *
 * @param client - TDLib 客户端实例
 * @param proxyId - 要测试的代理ID
 * @returns 返回包含测试结果
 */
export async function pingProxy(client: Client, proxy_id: number) {
  try {
    const result = await client.invoke({
      _: "pingProxy",
      proxy_id: proxy_id,
    });
    return result;
  } catch (error) {
    logger.error("pingProxy Error:", error);
    return null;
  }
}

/**
 * 测试代理连接到电报服务器的能力
 *
 * @param client - TDLib 客户端实例
 * @param server - 服务器ip
 * @param port - 服务器端口
 * @param type - 代理类型配置
 * @param dcId - 数据中心ID，范围1-5
 * @param timeout - 超时时间，单位为秒，默认为10秒
 * @returns 返回包含测试结果的对象，失败返回null
 */
export async function testProxy(
  client: Client,
  server: string,
  port: number,
  type: ProxyType$Input,
  dcId: 1 | 2 | 3 | 4 | 5,
  timeout: number = 10
) {
  try {
    const result = await client.invoke({
      _: "testProxy",
      server: server,
      port: port,
      type: type,
      dc_id: dcId,
      timeout: timeout,
    });
    return result;
  } catch (error) {
    logger.error("testProxy Error:", error);
    throw new Error("测试代理失败", { cause: error });
  }
}

/**
 * 获取SOCKS5或HTTP代理的分享链接
 *
 * @param client - TDLib 客户端实例
 * @param proxyId - 要获取链接的代理ID
 * @returns 返回包含代理链接的对象，失败返回null
 */
export async function getProxyLink(client: Client, proxy_id: number) {
  try {
    const result = await client.invoke({
      _: "getProxyLink",
      proxy_id: proxy_id,
    });
    return result;
  } catch (error) {
    logger.error("getProxyLink Error:", error);
    throw new Error("获取代理链接失败", { cause: error });
  }
}
