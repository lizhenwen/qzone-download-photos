const axios = require("axios");
const { error, log } = require("console");
const fs = require("fs");

//在控制台运行  alert(document.cookie)
//然后把内容粘贴到 COOKIE 变量下
let COOKIE;
const downloadFileName = "./photo_data.json";

const Tools = {
  getACSRFToken(cookieStr) {
    var str = Tools.getCookie(cookieStr, "p_skey");
    var hash = 5381;

    for (var i = 0, len = str.length; i < len; ++i) {
      hash += (hash << 5) + str.charCodeAt(i);
    }

    return hash & 0x7fffffff;
  },
  getCookie(cookieStr, key) {
    const cookiesArray = cookieStr.split(";");

    for (let i = 0; i < cookiesArray.length; i++) {
      let keyValue = cookiesArray[i].trim();

      if (keyValue.indexOf(key) === -1) continue;

      return decodeURIComponent(keyValue.substring(keyValue.indexOf("=") + 1));
    }

    // 如果找不到key，返回null
    return null;
  },
};


const Photos = {
  async getAlbumList(){
    const url =
      "https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/fcg_list_album_v3?t=544565479&appid=4&inCharset=utf-8&outCharset=utf-8&source=qzone&plat=qzone&format=json&notice=0&filter=1&handset=4&pageNumModeSort=40&pageNumModeClass=15&needUserInfo=1&idcNum=4&_=" +(new Date().getTime());

    let rs;
        
    try {
      const resp = await axios.get(
        url,
        {
          params: {
            g_tk: Tools.getACSRFToken(COOKIE),
            hostUin: Tools.getCookie(COOKIE, "ptui_loginuin"),
            uin: Tools.getCookie(COOKIE, "ptui_loginuin"),
          },
          headers: {
            cookie: COOKIE,
          },
        }
      );

      rs = resp?.data?.data?.albumListModeSort;
    } catch (error) {
      console.log(`getAlbumList axios error: `);
      
      console.error(error);
    }

    return rs;
  },
  async getPhotoList(albumInfo){
    let url = "https://h5.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/cgi_list_photo?t=749826639&mode=0&idcNum=4&noTopic=0&skipCmtCount=0&singleurl=1&batchId=&notice=0&appid=4&inCharset=utf-8&outCharset=utf-8&source=qzone&plat=qzone&outstyle=json&format=json&json_esc=1&_="+(new Date().getTime());

    let topicId = albumInfo.id;

    let rs;

    try {
      const resp = await axios.get(
        url,
        {
          params: {
            g_tk: Tools.getACSRFToken(COOKIE),
            hostUin: Tools.getCookie(COOKIE, "ptui_loginuin"),
            uin: Tools.getCookie(COOKIE, "ptui_loginuin"),
            topicId,
            pageStart:0,
            pageNum:1000000,
          },
          headers: {
            cookie: COOKIE,
          },
        }
      );

      rs = resp?.data?.data?.photoList;
    } catch (error) {
      console.log(`getPhotoList axios error: `);
      
      console.error(error);
    }

    return rs;
  }
}

async function downloadData() {
  console.log("开始下载照片数据.....");
  let data = [];

  let albums = await Photos.getAlbumList();
  for (let album of albums) {
    let photos = await Photos.getPhotoList(album);
    data.push({
      name: album.name,
      id: album.id,
      photos,
    });
  }
  fs.writeFileSync(downloadFileName, JSON.stringify(data, null, 2));
  console.log(`已将照片数据保存到 ${downloadFileName}`);

  return data;
}

async function start() {
  //初始化 cookie
  COOKIE = (fs.readFileSync("./cookie.txt", "utf8") || "").trim();
  if (!COOKIE) {
    console.error("-----------------------WARNING-----------------------------\n");
    console.error("请登录 qzone.qq.com，然后将 cookie 复制到 cookie.txt 文件内。");
    console.error("\n------------------------------------------------------------");
    return 
  }
  
  let data = await downloadData();
}

start();