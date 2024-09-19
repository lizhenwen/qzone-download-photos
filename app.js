const axios = require("axios");
const fs = require("fs");

//在控制台运行  alert(document.cookie)
//然后把内容粘贴到 COOKIE 变量下
const COOKIE =
  "RK=zEF1x7iybf; ptcz=bdd10a82e1fee4453d0e9c3ec2f98083139d7c9ef96a3162c37da9dfa090de61; ptui_loginuin=67401840; _clck=1jnyatf|1|fp1|0; pgv_pvid=9ffead1705c2efd8; _qimei_q36=; _qimei_h38=fa620d7552886a96ad68e8510300000c218509; p_uin=o0067401840; SL_G_WPT_TO=en; SL_GWPT_Show_Hide_tmp=1; SL_wptGlobTipTmp=1; qqmusic_uin=0067401840; qqmusic_fromtag=6; 67401840_todaycount=0; 67401840_totalcount=15380; pgv_info=ssid=s9733420016; QZ_FE_WEBP_SUPPORT=1; cpu_performance_v8=1; __Q_w_s__QZN_TodoMsgCnt=1; uin=o0067401840; skey=@HF7ilJ4iy; pt4_token=ENlT7YfB6RMXPvMYzRzNozhKh28kG3F0Pmh-T8rii2U_; p_skey=yRxkdm62GEuIpYpe6Q6cu8Xget*csr4cu0CCWzFvafM_; Loading=Yes; qz_screen=1920x1080; qqmusic_key=@HF7ilJ4iy; qzmusicplayer=qzone_player_67401840_1726734030299";
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
  console.log(`已下载照片数据到 ${downloadFileName}`);
}

downloadData();