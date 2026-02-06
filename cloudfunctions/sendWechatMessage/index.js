const cloud = require('wx-server-sdk')
const request = require('request-promise')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const WEBHOOK_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=a4bb4b18-c95a-49c6-82a8-238ac40f2ede';

exports.main = async (event, context) => {
  const { content } = event

  if (!content) {
    return {
      code: -1,
      message: '缺少必要参数'
    }
  }

  try {
    const data = {
      msgtype: 'markdown',
      markdown: {
        content: content
      }
    }

    const options = {
      method: 'POST',
      uri: WEBHOOK_URL,
      body: data,
      json: true,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    const response = await request(options)

    if (response.errcode === 0) {
      return {
        code: 0,
        message: '发送成功',
        data: response
      }
    } else {
      console.error('企业微信返回错误:', response)
      return {
        code: response.errcode || -1,
        message: response.errmsg || '发送失败'
      }
    }
  } catch (error) {
    console.error('发送企业微信消息失败:', error)
    return {
      code: -1,
      message: '发送失败: ' + error.message
    }
  }
}
