// server.ts
let kv: Deno.Kv;

//==============================================+
//--------请在这里修改管理员密码（token）--------|
const ADMIN_PASSWORD = "******************";//  |
//==============================================+
// 初始化 KV
async function initKV() {
  try {
    kv = await Deno.openKv();
    console.log("KV 数据库初始化成功");
  } catch (error) {
    console.error("KV 数据库初始化失败:", error);
    throw error;
  }
}

// 管理员认证
async function verifyAdminAuth(token: string): Promise<boolean> {
  try {
    const adminSession = await kv.get(["admin_session", token]);
    if (!adminSession.value) {
      return false;
    }
    
    const sessionData = adminSession.value as { expires: string };
    const now = new Date();
    const expires = new Date(sessionData.expires);
    
    if (now > expires) {
      // 会话过期，删除
      await kv.delete(["admin_session", token]);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("验证管理员权限失败:", error);
    return false;
  }
}
async function createAdminSession(): Promise<string> {
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  
  await kv.set(["admin_session", token], {
    expires: expires.toISOString()
  });
  
  return token;
}

async function generateAdminKey(): Promise<string> {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  const keyLength = 24;
  for (let i = 0; i < keyLength; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    key += chars[randomIndex];
  }

  return key;
}

// 去重函数
async function removeDuplicateQuotes() {
  try {
    console.log("开始去重处理...");
    
    const quotesMap = new Map();
    const quotesToDelete = [];
    
    const list = kv.list({ prefix: ["quotes"] });
    for await (const res of list) {
      if (res.value) {
        const key = `${res.value.message}|${res.value.author}`;
        if (quotesMap.has(key)) {
          quotesToDelete.push(res.key);
          console.log(`标记删除重复项: ${res.value.message} - ${res.value.author}`);
        } else {
          quotesMap.set(key, res.key);
        }
      }
    }
    
    let deletedCount = 0;
    for (const key of quotesToDelete) {
      await kv.delete(key);
      deletedCount++;
    }
    console.log(`去重完成，删除了 ${deletedCount} 条重复数据`);
    return deletedCount;
  } catch (error) {
    console.error("去重处理失败:", error);
  }
}

// 默认的回声数据
const defaultQuotes = [
  { message: "你好世界！", author: "系统" },
  { message: "今天天气不错呢！", author: "天气预报员" },
  { message: "Deno 是一个很棒的运行时！", author: "Ryan Dahl" },
  { message: "生活就像一盒巧克力，你永远不知道下一颗是什么味道。", author: "阿甘" },
  { message: "代码改变世界！", author: "程序员" }
];

// 初始化默认数据
async function initDefaultData() {
  try {
    const countKey = ["config", "initialized"];
    const initialized = await kv.get(countKey);
    
    if (!initialized.value) {
      console.log("初始化默认数据...");
      for (const quote of defaultQuotes) {
        const id = crypto.randomUUID();
        await kv.set(["quotes", id], quote);
        console.log(`添加默认回声: ${quote.message}`);
      }
      await kv.set(countKey, true);
      console.log("默认数据初始化完成");
    }
  } catch (error) {
    console.error("初始化默认数据失败:", error);
  }
}

// 检查是否重复
async function isDuplicate(message: string, author: string): Promise<boolean> {
  try {
    const list = kv.list({ prefix: ["quotes"] });
    for await (const res of list) {
      if (res.value && 
          res.value.message === message && 
          res.value.author === author) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("检查重复失败:", error);
    return false;
  }
}

// 检查是否存在任何密钥
async function hasAnyKeys(): Promise<boolean> {
  try {
    const list = kv.list({ prefix: ["admin_key"] });
    return true;
  } catch (error) {
    console.error("检查密钥失败:", error);
    return false;
  }
}

// 初始化
await initKV();
await initDefaultData();
await removeDuplicateQuotes();

Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  // 获取随机回复
  if (req.method === "GET" && url.pathname === "/api/reply") {
    try {
      const quotes = [];
      const list = kv.list({ prefix: ["quotes"] });
      
      for await (const res of list) {
        if (res.value) {
          quotes.push(res.value);
        }
      }
      
      console.log(`接收到随机请求`);
      
      if (quotes.length === 0) {
        return new Response(
          JSON.stringify({ 
            message: "暂无回声，请先添加！", 
            author: "系统",
            total_quotes: 0
          }),
          {
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
      
      const response = {
        message: randomQuote.message,
        author: randomQuote.author,
        total_quotes: quotes.length,
        timestamp: new Date().toISOString()
      };
      
      if (randomQuote.created_at) {
        response.created_at = randomQuote.created_at;
      }
      
      return new Response(
        JSON.stringify(response),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch (error) {
      console.error("获取回声失败:", error);
      return new Response(
        JSON.stringify({ 
          error: "获取回声失败",
          message: error.message 
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
  
  if (req.method === "POST" && url.pathname === "/api/add") {
    try {
      const body = await req.json();
      const { message, author, key } = body;
      
      if (!message || !author) {
        return new Response(
          JSON.stringify({ error: "message 和 author 都是必填项" }),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const anyKeysExist = await hasAnyKeys();
      if (anyKeysExist) {
        // 如果有密钥，必须验证密钥
        if (!key) {
          return new Response(
            JSON.stringify({ 
              error: "需要密钥",
              message: "添加回声需要有效的密钥"
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            }
          );
        }
        
        const keyData = await kv.get(["admin_key", key]);
        if (!keyData.value) {
          return new Response(
            JSON.stringify({ 
              error: "无效密钥",
              message: "提供的密钥无效或已使用"
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            }
          );
        }
        
        const keyInfo = keyData.value as { 
          created_at: string, 
          used: number, 
          max_uses: number 
        };
        
        if (keyInfo.used >= keyInfo.max_uses) {
          await kv.delete(["admin_key", key]);
          return new Response(
            JSON.stringify({ 
              error: "无效密钥",
              message: "提供的密钥无效或已使用"
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            }
          );
        }
        
        const newUses = keyInfo.used + 1;
        await kv.set(["admin_key", key], {
          created_at: keyInfo.created_at,
          used: newUses,
          max_uses: keyInfo.max_uses
        });
        
        if (newUses >= keyInfo.max_uses) {
          await kv.delete(["admin_key", key]);
        }
      } else {
        console.log("未检测到密钥，允许无密钥添加");
      }
      
      const isDup = await isDuplicate(message.trim(), author.trim());
      if (isDup) {
        return new Response(
          JSON.stringify({ 
            error: "重复的回声",
            message: "该回声和作者已经存在，无需重复添加"
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const newQuote = {
        message: message.trim(),
        author: author.trim(),
        created_at: new Date().toISOString()
      };
      
      const id = crypto.randomUUID();
      await kv.set(["quotes", id], newQuote);
      
      
      const responseData = {
        success: true,
        message: "添加成功！",
        data: {
          id: id,
          message: newQuote.message,
          author: newQuote.author,
          created_at: newQuote.created_at
        }
      };
      
      return new Response(
        JSON.stringify(responseData),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch (error) {
      console.error("添加回声失败:", error);
      return new Response(
        JSON.stringify({ 
          error: "添加失败",
          message: error.message 
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
  
  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    try {
      const body = await req.json();
      const { password } = body;
      
      if (password === ADMIN_PASSWORD) {
        const token = await createAdminSession();
        
        const responseData = {
          success: true,
          message: "登录成功",
          token: token,
          expires_in: "10分钟"
        };
        
        return new Response(
          JSON.stringify(responseData),
          {
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      } else {
        const errorData = {
          error: "登录失败",
          message: "token错误"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 401,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
    } catch (error) {
      const errorData = {
        error: "登录失败",
        message: error.message
      };
      
      return new Response(
        JSON.stringify(errorData),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
  
  if (req.method === "POST" && url.pathname === "/api/admin/generate-key") {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        const errorData = {
          error: "未授权访问"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 401,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const token = authHeader.substring(7);
      const isAdmin = await verifyAdminAuth(token);
      
      if (!isAdmin) {
        const errorData = {
          error: "权限不足"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 403,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const key = await generateAdminKey();
      // 默认使用次数为1
      await kv.set(["admin_key", key], {
        created_at: new Date().toISOString(),
        used: 0,
        max_uses: 1
      });
      const responseData = {
        success: true,
        message: "密钥生成成功",
        key: key,
        max_uses: 1
      };
      
      return new Response(
        JSON.stringify(responseData),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch (error) {
      const errorData = {
        error: "生成密钥失败",
        message: error.message
      };
      
      return new Response(
        JSON.stringify(errorData),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
  
  if (req.method === "POST" && url.pathname === "/api/admin/generate-key-with-uses") {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        const errorData = {
          error: "未授权访问"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 401,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const token = authHeader.substring(7);
      const isAdmin = await verifyAdminAuth(token);
      
      if (!isAdmin) {
        const errorData = {
          error: "权限不足"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 403,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const body = await req.json();
      const { max_uses = 1 } = body;
      
      if (max_uses <= 0) {
        const errorData = {
          error: "无效的使用次数",
          message: "使用次数必须大于0"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const key = await generateAdminKey();
      await kv.set(["admin_key", key], {
        created_at: new Date().toISOString(),
        used: 0,
        max_uses: max_uses
      });
      const responseData = {
        success: true,
        message: "密钥生成成功",
        key: key,
        max_uses: max_uses
      };
      
      return new Response(
        JSON.stringify(responseData),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch (error) {
      const errorData = {
        error: "生成密钥失败",
        message: error.message
      };
      
      return new Response(
        JSON.stringify(errorData),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
  
  // 获取所有密钥（管理员接口）
  if (req.method === "GET" && url.pathname === "/api/admin/keys") {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        const errorData = {
          error: "未授权访问"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 401,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const token = authHeader.substring(7);
      const isAdmin = await verifyAdminAuth(token);
      
      if (!isAdmin) {
        const errorData = {
          error: "权限不足"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 403,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const keys = [];
      const list = kv.list({ prefix: ["admin_key"] });
      for await (const res of list) {
        if (res.value) {
          keys.push({
            key: res.key[1],
            created_at: res.value.created_at,
            used: res.value.used,
            max_uses: res.value.max_uses,
            remaining_uses: res.value.max_uses - res.value.used
          });
        }
      }
      
      const responseData = {
        total: keys.length,
        keys: keys
      };
      
      return new Response(
        JSON.stringify(responseData),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch (error) {
      const errorData = {
        error: "获取密钥列表失败",
        message: error.message
      };
      
      return new Response(
        JSON.stringify(errorData),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
  
  // 删除密钥（管理员接口）
  if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/keys/")) {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        const errorData = {
          error: "未授权访问"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 401,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const token = authHeader.substring(7);
      const isAdmin = await verifyAdminAuth(token);
      
      if (!isAdmin) {
        const errorData = {
          error: "权限不足"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 403,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const key = url.pathname.split("/").pop();
      if (!key) {
        const errorData = {
          error: "无效的密钥"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      await kv.delete(["admin_key", key]);
      
      const responseData = {
        success: true,
        message: "密钥删除成功"
      };
      
      return new Response(
        JSON.stringify(responseData),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch (error) {
      const errorData = {
        error: "删除密钥失败",
        message: error.message
      };
      
      return new Response(
        JSON.stringify(errorData),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
  
  // 获取所有回声（管理员接口）
  if (req.method === "GET" && url.pathname === "/api/admin/list") {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        const errorData = {
          error: "未授权访问"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 401,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const token = authHeader.substring(7);
      const isAdmin = await verifyAdminAuth(token);
      
      if (!isAdmin) {
        const errorData = {
          error: "权限不足"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 403,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const quotes = [];
      const list = kv.list({ prefix: ["quotes"] });
      for await (const res of list) {
        if (res.value) {
          quotes.push({
            id: res.key[1],
            message: res.value.message,
            author: res.value.author,
            created_at: res.value.created_at
          });
        }
      }
      
      const responseData = {
        total: quotes.length,
        quotes: quotes
      };
      
      return new Response(
        JSON.stringify(responseData),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch (error) {
      const errorData = {
        error: "获取列表失败",
        message: error.message
      };
      
      return new Response(
        JSON.stringify(errorData),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
  
  // 删除回声（管理员接口）
  if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/quotes/")) {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        const errorData = {
          error: "未授权访问"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 401,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const token = authHeader.substring(7);
      const isAdmin = await verifyAdminAuth(token);
      
      if (!isAdmin) {
        const errorData = {
          error: "权限不足"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 403,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const quoteId = url.pathname.split("/").pop();
      if (!quoteId) {
        const errorData = {
          error: "无效的回声ID"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      await kv.delete(["quotes", quoteId]);
      console.log("删除一条信息");
      const responseData = {
        success: true,
        message: "删除成功"
      };
      
      return new Response(
        JSON.stringify(responseData),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch (error) {
      const errorData = {
        error: "删除失败",
        message: error.message
      };
      console.error("删除失败");
      return new Response(
        JSON.stringify(errorData),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
  
  // 更新回声（管理员接口）
  if (req.method === "PUT" && url.pathname.startsWith("/api/admin/quotes/")) {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        const errorData = {
          error: "未授权访问"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 401,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const token = authHeader.substring(7);
      const isAdmin = await verifyAdminAuth(token);
      
      if (!isAdmin) {
        const errorData = {
          error: "权限不足"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 403,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const quoteId = url.pathname.split("/").pop();
      if (!quoteId) {
        const errorData = {
          error: "无效的回声ID"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const body = await req.json();
      const { message, author } = body;
      
      if (!message || !author) {
        const errorData = {
          error: "message 和 author 都是必填项"
        };
        
        return new Response(
          JSON.stringify(errorData),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      
      const updatedQuote = {
        message: message.trim(),
        author: author.trim(),
        updated_at: new Date().toISOString()
      };
      
      await kv.set(["quotes", quoteId], updatedQuote);
      
      const responseData = {
        success: true,
        message: "更新成功",
        data: {
          id: quoteId,
          message: updatedQuote.message,
          author: updatedQuote.author,
          updated_at: updatedQuote.updated_at
        }
      };
      
      return new Response(
        JSON.stringify(responseData),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch (error) {
      const errorData = {
        error: "更新失败",
        message: error.message
      };
      
      return new Response(
        JSON.stringify(errorData),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
  
  // 管理员登录页面
  if (req.method === "GET" && url.pathname === "/admin/login") {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>管理员登录</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 400px;
            margin: 100px auto 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #555;
        }
        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
            box-sizing: border-box;
        }
        input:focus {
            border-color: #4CAF50;
            outline: none;
        }
        button {
            background-color: #4CAF50;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            width: 100%;
            transition: background-color 0.3s;
        }
        button:hover {
            background-color: #45a049;
        }
        .message {
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
            display: none;
        }
        .success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .info {
            background-color: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>管理员登录</h1>
        <form id="loginForm">
            <div class="form-group">
                <label for="password">token：</label>
                <input type="password" id="password" name="password" required>
            </div>
            <button type="submit">登录</button>
        </form>
        <div id="messageBox" class="message"></div>
    </div>

    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const password = document.getElementById('password').value;
            const messageBox = document.getElementById('messageBox');
            
            try {
                const response = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ password })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    messageBox.className = 'message success';
                    messageBox.textContent = result.message;
                    messageBox.style.display = 'block';
                    
                    // 保存 token 到 localStorage
                    localStorage.setItem('admin_token', result.token);
                    
                    // 跳转到管理页面
                    setTimeout(() => {
                        window.location.href = '/admin';
                    }, 1000);
                } else {
                    messageBox.className = 'message error';
                    messageBox.textContent = result.message;
                    messageBox.style.display = 'block';
                }
            } catch (error) {
                messageBox.className = 'message error';
                messageBox.textContent = '网络错误，请重试: ' + error.message;
                messageBox.style.display = 'block';
            }
        });
    </script>
</body>
</html>`;
    
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    });
  }
  
  // 管理员管理页面
  if (req.method === "GET" && url.pathname === "/admin") {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>管理后台</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .logout-btn {
            background-color: #dc3545;
            color: white;
            padding: 8px 16px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        }
        .logout-btn:hover {
            background-color: #c82333;
        }
        .section {
            margin-bottom: 30px;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .section-title {
            margin-top: 0;
            color: #333;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f8f9fa;
            font-weight: bold;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        .actions {
            display: flex;
            gap: 10px;
        }
        .edit-btn {
            background-color: #007bff;
            color: white;
            padding: 5px 10px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        .delete-btn {
            background-color: #dc3545;
            color: white;
            padding: 5px 10px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        .generate-btn {
            background-color: #28a745;
            color: white;
            padding: 5px 10px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        .edit-btn:hover {
            background-color: #0056b3;
        }
        .delete-btn:hover {
            background-color: #c82333;
        }
        .generate-btn:hover {
            background-color: #218838;
        }
        .message {
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
            display: none;
        }
        .success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.4);
        }
        .modal-content {
            background-color: white;
            margin: 15% auto;
            padding: 20px;
            border-radius: 10px;
            width: 500px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .close {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
        }
        .close:hover {
            color: black;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input, textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        .modal-actions {
            text-align: right;
            margin-top: 20px;
        }
        .cancel-btn {
            background-color: #6c757d;
            color: white;
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            margin-right: 10px;
            cursor: pointer;
        }
        .save-btn {
            background-color: #28a745;
            color: white;
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .key-display {
            background-color: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            word-break: break-all;
            margin: 10px 0;
        }
        .key-info {
            font-size: 12px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>回声管理后台</h1>
            <button class="logout-btn" onclick="logout()">退出登录</button>
        </div>
        <div id="messageBox" class="message"></div>
        
        <!-- 密钥管理部分 -->
        <div class="section">
            <h2 class="section-title">密钥管理</h2>
            <button class="generate-btn" onclick="generateKey()">生成新密钥 (1次使用)</button>
            <button class="generate-btn" onclick="generateKeyWithUses()">生成多使用次数密钥</button>
            <button class="generate-btn" onclick="loadKeys()">刷新密钥列表</button>
            <div id="keysContainer">
                <p>加载中...</p>
            </div>
        </div>
        
        <!-- 回声列表部分 -->
        <div class="section">
            <h2 class="section-title">回声列表</h2>
            <table id="quotesTable">
                <thead>
                    <tr>
                        <th>回声内容</th>
                        <th>作者</th>
                        <th>创建时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="quotesList">
                    <tr>
                        <td colspan="4" style="text-align: center;">加载中...</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- 生成多使用次数密钥模态框 -->
    <div id="generateUsesModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeGenerateUsesModal()">&times;</span>
            <h2>生成多使用次数密钥</h2>
            <form id="generateUsesForm">
                <div class="form-group">
                    <label for="maxUses">最大使用次数：</label>
                    <input type="number" id="maxUses" name="maxUses" min="1" value="5" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="cancel-btn" onclick="closeGenerateUsesModal()">取消</button>
                    <button type="submit" class="save-btn">生成密钥</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 编辑模态框 -->
    <div id="editModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal()">&times;</span>
            <h2>编辑回声</h2>
            <form id="editForm">
                <input type="hidden" id="editId">
                <div class="form-group">
                    <label for="editMessage">回声内容：</label>
                    <textarea id="editMessage" rows="3" required></textarea>
                </div>
                <div class="form-group">
                    <label for="editAuthor">作者：</label>
                    <input type="text" id="editAuthor" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="cancel-btn" onclick="closeModal()">取消</button>
                    <button type="submit" class="save-btn">保存</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        let currentToken = localStorage.getItem('admin_token');
        
        // 检查是否已登录
        if (!currentToken) {
            window.location.href = '/admin/login';
        }
        
        // 加载回声列表
        async function loadQuotes() {
            try {
                const response = await fetch('/api/admin/list', {
                    headers: {
                        'Authorization': 'Bearer ' + currentToken
                    }
                });
                
                if (response.status === 401 || response.status === 403) {
                    showMessage('登录已过期，请重新登录', 'error');
                    setTimeout(() => {
                        localStorage.removeItem('admin_token');
                        window.location.href = '/admin/login';
                    }, 2000);
                    return;
                }
                
                const result = await response.json();
                
                if (response.ok) {
                    const tbody = document.getElementById('quotesList');
                    tbody.innerHTML = '';
                    
                    if (result.quotes.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">暂无数据</td></tr>';
                        return;
                    }
                    
                    result.quotes.forEach(quote => {
                        const row = document.createElement('tr');
                        row.innerHTML = \`
                            <td>\${quote.message}</td>
                            <td>\${quote.author}</td>
                            <td>\${quote.created_at || 'N/A'}</td>
                            <td class="actions">
                                <button class="edit-btn" onclick="editQuote('\${quote.id}', '\${quote.message}', '\${quote.author}')">编辑</button>
                                <button class="delete-btn" onclick="deleteQuote('\${quote.id}')">删除</button>
                            </td>
                        \`;
                        tbody.appendChild(row);
                    });
                } else {
                    showMessage(result.message, 'error');
                }
            } catch (error) {
                showMessage('加载失败: ' + error.message, 'error');
            }
        }
        
        // 加载密钥列表
        async function loadKeys() {
            try {
                const response = await fetch('/api/admin/keys', {
                    headers: {
                        'Authorization': 'Bearer ' + currentToken
                    }
                });
                
                if (response.status === 401 || response.status === 403) {
                    showMessage('登录已过期，请重新登录', 'error');
                    setTimeout(() => {
                        localStorage.removeItem('admin_token');
                        window.location.href = '/admin/login';
                    }, 2000);
                    return;
                }
                
                const result = await response.json();
                
                if (response.ok) {
                    const container = document.getElementById('keysContainer');
                    if (result.keys.length === 0) {
                        container.innerHTML = '<p>暂无密钥</p>';
                        return;
                    }
                    
                    let html = '<ul style="list-style-type: none; padding: 0;">';
                    result.keys.forEach(key => {
                        html += \`
                            <li style="margin-bottom: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                                <strong>密钥:</strong> <span class="key-display">\${key.key}</span>
                                <div class="key-info">
                                    创建时间: \${key.created_at}<br>
                                    已使用: \${key.used}/\${key.max_uses} 次<br>
                                    剩余次数: \${key.remaining_uses} 次
                                </div>
                                <button class="delete-btn" onclick="deleteKey('\${key.key}')" style="float: right;">删除</button>
                            </li>
                        \`;
                    });
                    html += '</ul>';
                    container.innerHTML = html;
                } else {
                    showMessage(result.message, 'error');
                }
            } catch (error) {
                showMessage('加载密钥失败: ' + error.message, 'error');
            }
        }
        
        // 生成新密钥（默认1次使用）
        async function generateKey() {
            try {
                const response = await fetch('/api/admin/generate-key', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + currentToken
                    }
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showMessage('密钥生成成功: ' + result.key, 'success');
                    loadKeys();
                } else {
                    showMessage(result.message, 'error');
                }
            } catch (error) {
                showMessage('生成密钥失败: ' + error.message, 'error');
            }
        }
        
        // 生成多使用次数密钥
        async function generateKeyWithUses() {
            document.getElementById('generateUsesModal').style.display = 'block';
        }
        
        // 关闭生成多使用次数密钥模态框
        function closeGenerateUsesModal() {
            document.getElementById('generateUsesModal').style.display = 'none';
        }
        
        // 删除密钥
        async function deleteKey(key) {
            if (!confirm('确定要删除这个密钥吗？')) {
                return;
            }
            
            try {
                const response = await fetch('/api/admin/keys/' + key, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': 'Bearer ' + currentToken
                    }
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showMessage('密钥删除成功', 'success');
                    loadKeys();
                } else {
                    showMessage(result.message, 'error');
                }
            } catch (error) {
                showMessage('删除密钥失败: ' + error.message, 'error');
            }
        }
        
        // 编辑回声
        function editQuote(id, message, author) {
            document.getElementById('editId').value = id;
            document.getElementById('editMessage').value = message;
            document.getElementById('editAuthor').value = author;
            document.getElementById('editModal').style.display = 'block';
        }
        
        // 关闭模态框
        function closeModal() {
            document.getElementById('editModal').style.display = 'none';
        }
        
        // 删除回声
        async function deleteQuote(id) {
            if (!confirm('确定要删除这条回声吗？')) {
                return;
            }
            
            try {
                const response = await fetch('/api/admin/quotes/' + id, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': 'Bearer ' + currentToken
                    }
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showMessage('删除成功', 'success');
                    loadQuotes();
                } else {
                    showMessage(result.message, 'error');
                }
            } catch (error) {
                showMessage('删除失败: ' + error.message, 'error');
            }
        }
        
        // 退出登录
        function logout() {
            localStorage.removeItem('admin_token');
            window.location.href = '/admin/login';
        }
        
        // 显示消息
        function showMessage(message, type) {
            const messageBox = document.getElementById('messageBox');
            messageBox.className = 'message ' + type;
            messageBox.textContent = message;
            messageBox.style.display = 'block';
            
            setTimeout(() => {
                messageBox.style.display = 'none';
            }, 3000);
        }
        
        // 表单提交事件
        document.getElementById('editForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const id = document.getElementById('editId').value;
            const message = document.getElementById('editMessage').value;
            const author = document.getElementById('editAuthor').value;
            
            try {
                const response = await fetch('/api/admin/quotes/' + id, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + currentToken
                    },
                    body: JSON.stringify({ message, author })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showMessage('更新成功', 'success');
                    closeModal();
                    loadQuotes();
                } else {
                    showMessage(result.message, 'error');
                }
            } catch (error) {
                showMessage('更新失败: ' + error.message, 'error');
            }
        });
        
        // 生成多使用次数密钥表单提交
        document.getElementById('generateUsesForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const maxUses = document.getElementById('maxUses').value;
            
            try {
                const response = await fetch('/api/admin/generate-key-with-uses', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + currentToken
                    },
                    body: JSON.stringify({ max_uses: parseInt(maxUses) })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showMessage('密钥生成成功: ' + result.key, 'success');
                    closeGenerateUsesModal();
                    loadKeys();
                } else {
                    showMessage(result.message, 'error');
                }
            } catch (error) {
                showMessage('生成密钥失败: ' + error.message, 'error');
            }
        });
        
        // 页面加载完成后获取数据
        document.addEventListener('DOMContentLoaded', function() {
            loadQuotes();
            loadKeys();
        });
        
        // 点击模态框外部关闭
        window.onclick = function(event) {
            const modal = document.getElementById('generateUsesModal');
            if (event.target == modal) {
                closeGenerateUsesModal();
            }
            
            const editModal = document.getElementById('editModal');
            if (event.target == editModal) {
                closeModal();
            }
        }
    </script>
</body>
</html>`;
    
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    });
  }
  
  // 手动触发去重（用于调试）
  if (req.method === "POST" && url.pathname === "/api/dedup") {
    try {
      const deletedCount = await removeDuplicateQuotes();
      const responseData = {
        success: true,
        message: "去重完成，删除了 " + deletedCount + " 条重复数据"
      };
      
      return new Response(
        JSON.stringify(responseData),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    } catch (error) {
      const errorData = {
        error: "去重失败",
        message: error.message
      };
      
      return new Response(
        JSON.stringify(errorData),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
  
  // 添加回声的 HTML 页面
  if (req.method === "GET" && url.pathname === "/add") {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>添加回声</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #555;
        }
        input, textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
            box-sizing: border-box;
        }
        input:focus, textarea:focus {
            border-color: #4CAF50;
            outline: none;
        }
        button {
            background-color: #4CAF50;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            width: 100%;
            transition: background-color 0.3s;
        }
        button:hover {
            background-color: #45a049;
        }
        .message {
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
            display: none;
        }
        .success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .warning {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        .back-link {
            text-align: center;
            margin-top: 20px;
        }
        .back-link a {
            color: #4CAF50;
            text-decoration: none;
        }
        .back-link a:hover {
            text-decoration: underline;
        }
        .info {
            background-color: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>添加新回声</h1>
        <div class="info">
            <strong>注意：</strong><br>
            添加回声需要有效的密钥，请向管理员获取。
        </div>
        <form id="quoteForm">
            <div class="form-group">
                <label for="message">回声内容：</label>
                <textarea id="message" name="message" rows="3" placeholder="请输入要添加的回声..." required></textarea>
            </div>
            <div class="form-group">
                <label for="author">作者：</label>
                <input type="text" id="author" name="author" placeholder="请输入作者姓名..." required>
            </div>
            <div class="form-group">
                <label for="key">密钥：</label>
                <input type="text" id="key" name="key" placeholder="请输入密钥..." required>
            </div>
            <button type="submit">添加回声</button>
        </form>
        <div id="messageBox" class="message"></div>
        <div class="back-link">
            <a href="/api/reply">← 获取随机回声</a> |
            <a href="/admin/login">管理员登录</a>
        </div>
    </div>

    <script>
        document.getElementById('quoteForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const message = document.getElementById('message').value;
            const author = document.getElementById('author').value;
            const key = document.getElementById('key').value;
            
            const messageBox = document.getElementById('messageBox');
            
            try {
                const response = await fetch('/api/add', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ message, author, key })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    messageBox.className = 'message success';
                    messageBox.innerHTML = result.message + '<br>请刷新页面或点击"获取随机回声"查看效果';
                    messageBox.style.display = 'block';
                    document.getElementById('quoteForm').reset();
                } else {
                    if (result.error === "需要密钥" || result.error === "无效密钥") {
                        messageBox.className = 'message warning';
                    } else {
                        messageBox.className = 'message error';
                    }
                    messageBox.textContent = result.message || result.error;
                    messageBox.style.display = 'block';
                }
            } catch (error) {
                messageBox.className = 'message error';
                messageBox.textContent = '网络错误，请重试: ' + error.message;
                messageBox.style.display = 'block';
            }
        });
    </script>
</body>
</html>`;
    
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    });
  }
  
  // 处理根路径
  if (req.method === "GET" && url.pathname === "/") {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>回声洞</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: #f5f5f5;
            cursor: pointer;
            overflow: hidden;
            position: relative;
        }
        
        .title {
            font-size: 4rem;
            color: #333;
            text-align: center;
            z-index: 10;
            transition: all 0.3s ease;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
            position: absolute;
            top: 10%;
            left: 50%;
            transform: translateX(-50%);
        }
        
        .title:hover {
            transform: translateX(-50%) scale(1.05);
            color: #4CAF50;
        }
        
        .quote-container {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            max-width: 500px;
            width: 90%;
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
            transition: all 0.4s ease;
            z-index: 5;
        }
        
        .quote-container.show {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }
        
        .quote-message {
            font-size: 1.2rem;
            line-height: 1.6;
            color: #333;
            margin-bottom: 20px;
            text-align: center;
            font-style: italic;
        }
        
        .quote-author {
            font-weight: bold;
            color: #4CAF50;
            text-align: center;
            font-size: 1.1rem;
        }
        
        .quote-info {
            margin-top: 15px;
            font-size: 0.8rem;
            color: #666;
            text-align: center;
        }
        
        .back-link {
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 10;
        }
        
        .back-link a {
            color: #4CAF50;
            text-decoration: none;
            font-size: 0.9rem;
        }
        
        .back-link a:hover {
            text-decoration: underline;
        }
        
        .loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 20;
            display: none;
        }
        
        .loading:after {
            content: '';
            display: block;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            border: 4px solid #4CAF50;
            border-top-color: transparent;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
      <div class="title">回声洞</div>
      
      <div class="quote-container" id="quoteContainer">
          <div class="quote-message" id="quoteMessage"></div>
          <div class="quote-author" id="quoteAuthor"></div>
          <div class="quote-info" id="quoteInfo"></div>
      </div>
      
      <div class="loading" id="loading"></div>
      
      <div class="back-link">
          <a href="/add">添加回声</a> | 
          <a href="/admin/login">管理员登录</a>
      </div>

<script>
    // ====== 所有变量定义在最外层作用域 ======
    const quoteContainer = document.getElementById('quoteContainer');
    const quoteMessage = document.getElementById('quoteMessage');
    const quoteAuthor = document.getElementById('quoteAuthor');
    const quoteInfo = document.getElementById('quoteInfo');
    const loading = document.getElementById('loading');

    // 默认回声
    const defaultQuote = {
        message: "即使你友善，人们可能还是会说你自私和动机不良。不管怎样，你还是要友善。",
        author: "特雷莎修女",
        total_quotes: null,
        timestamp: "2025-08-29T18:24:49.199Z",
        created_at: "2025-08-29T18:17:54.615Z"
    };

    // 状态控制变量
    let isFetching = false;           // 是否正在请求
    let hideTimeout = null;           // 自动隐藏定时器

    // ====== 工具函数 ======
    function hideQuote() {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
        quoteContainer.classList.remove('show');
    }

    function showQuote() {
        quoteContainer.classList.add('show');
    }

    function showLoading() {
        loading.style.display = 'block';
    }

    function hideLoading() {
        loading.style.display = 'none';
    }

    // 显示新回声，并设置 3 秒后自动隐藏
    function displayQuote(quote) {
        quoteMessage.textContent = quote.message;
        quoteAuthor.textContent = \`—— \${quote.author}\`;
        quoteInfo.textContent = quote.total_quotes !== null 
            ? \`数据库共有 \${quote.total_quotes} 条回声\` 
            : '';

        if (hideTimeout) {
            clearTimeout(hideTimeout);
        }

        showQuote();

        hideTimeout = setTimeout(() => {
            hideQuote();
        }, 3000);
    }

    // 获取新回声
    async function fetchQuote() {
        if (isFetching) return;  // 防止重复请求

        hideQuote(); // 立即隐藏当前卡片

        await new Promise(resolve => setTimeout(resolve, 300)); // 等待动画

        showLoading();
        isFetching = true;

        try {
            const response = await fetch('/api/reply');
            if (!response.ok) throw new Error('网络响应不正常');
            const data = await response.json();

            hideLoading();
            displayQuote(data);
        } catch (error) {
            console.error('获取回声失败:', error);
            hideLoading();
            displayQuote(defaultQuote); // 使用默认回声
        } finally {
            isFetching = false;
        }
    }

    // ====== 事件绑定 ======
    document.body.addEventListener('click', fetchQuote);

    // 初始显示默认回声
    displayQuote(defaultQuote);
</script>
</body>
</html>
`;
     
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    });
  }
  
  // 404 处理
  const errorData = {
    error: "Not Found"
  };
  
  return new Response(
    JSON.stringify(errorData),
    {
      status: 404,
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
});
