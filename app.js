const axios = require("axios");
const fs = require("fs");
const path = require("path");
const exifr = require("exifr");

const { exec } = require("child_process");

exec("exiftool -ver", (err, stdout, stderr) => {
  if (err) {
    console.error("****** 如果需要给照片写入 exif，请手动安装 exiftool: https://exiftool.org/ ******");
  }
});


//在控制台运行  alert(document.cookie)
//然后把内容粘贴到 COOKIE 变量下
let COOKIE;
const exportDir = path.join(__dirname,"./export/");
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
  console.log(`创建目录：${exportDir}`);
}

const downloadFilePath = path.join(exportDir,"./photo_data.json");

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
  sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },
  formatExifTime(input) {
    input = (input || "").trim();
    const dateRegex1 = /(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/;
    const dateRegex2 = /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/;
    let match;
    if ((match = input.match(dateRegex1))) {
      return input;
    } else if ((match = input.match(dateRegex2))) {
      return `${match[1]}:${match[2]}:${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
    } else {
      return null;
    }
  },
};

const Photos = {
  async getAlbumList() {
    const url =
      "https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/fcg_list_album_v3?t=544565479&appid=4&inCharset=utf-8&outCharset=utf-8&source=qzone&plat=qzone&format=json&notice=0&filter=1&handset=4&pageNumModeSort=40&pageNumModeClass=15&needUserInfo=1&idcNum=4&_=" +
      new Date().getTime();

    let rs;

    try {
      const resp = await axios.get(url, {
        params: {
          g_tk: Tools.getACSRFToken(COOKIE),
          hostUin: Tools.getCookie(COOKIE, "ptui_loginuin"),
          uin: Tools.getCookie(COOKIE, "ptui_loginuin"),
        },
        headers: {
          cookie: COOKIE,
        },
      });

      rs = resp?.data?.data?.albumListModeSort;
    } catch (error) {
      console.log(`getAlbumList axios error: `);

      console.error(error);
    }

    return rs;
  },
  async getPhotoList(albumInfo) {
    let url =
      "https://h5.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/cgi_list_photo?t=749826639&mode=0&idcNum=4&noTopic=0&skipCmtCount=0&singleurl=1&batchId=&notice=0&appid=4&inCharset=utf-8&outCharset=utf-8&source=qzone&plat=qzone&outstyle=json&format=json&json_esc=1&_=" +
      new Date().getTime();

    let topicId = albumInfo.id;

    let rs;

    try {
      const resp = await axios.get(url, {
        params: {
          g_tk: Tools.getACSRFToken(COOKIE),
          hostUin: Tools.getCookie(COOKIE, "ptui_loginuin"),
          uin: Tools.getCookie(COOKIE, "ptui_loginuin"),
          topicId,
          pageStart: 0,
          pageNum: 1000000,
        },
        headers: {
          cookie: COOKIE,
        },
      });

      rs = resp?.data?.data?.photoList;
    } catch (error) {
      console.log(`getPhotoList axios error: `);

      console.error(error);
    }

    return rs;
  },
  async getVideoUrl(albumInfo, photoInfo) {
    let url =
      "https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/cgi_floatview_photo_list_v2?t=788063534&shootTime=&cmtOrder=1&fupdate=1&plat=qzone&source=qzone&cmtNum=10&likeNum=5&inCharset=utf-8&outCharset=utf-8&callbackFun=viewer&offset=0&number=15&appid=4&isFirst=1&sortOrder=5&showMode=1&need_private_comment=1&prevNum=9&postNum=18&format=json&json_esc=1&_=" +
      new Date().getTime();

    let topicId = albumInfo.id;
    let picKey = photoInfo.lloc;

    let rs;

    try {
      const resp = await axios.get(url, {
        params: {
          g_tk: Tools.getACSRFToken(COOKIE),
          hostUin: Tools.getCookie(COOKIE, "ptui_loginuin"),
          uin: Tools.getCookie(COOKIE, "ptui_loginuin"),
          picKey,
          topicId,
          pageStart: 0,
          pageNum: 1000000,
        },
        headers: {
          cookie: COOKIE,
        },
      });

      let resData = resp?.data?.data?.photos;
      if (resData && resData.length > 0) {
        resData.forEach((ele) => {
          let { lloc } = ele;
          if (lloc === picKey) {
            rs = (
              ele?.video_info?.download_url ||
              ele?.video_info?.video_url ||
              ""
            ).trim();
          }
        });
      } else {
        console.error("getVideoUrl 未拉取到照片数据");
      }
    } catch (error) {
      console.log(`getVideoUrl axios error: `);

      console.error(error);
    }

    return rs;
  },
  parsePhotoName(photoInfo) {
    //使用时间来命名
    let date = photoInfo.rawshoottime || photoInfo.uploadtime;
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    const hours = String(dateObj.getHours()).padStart(2, "0");
    const minutes = String(dateObj.getMinutes()).padStart(2, "0");
    const seconds = String(dateObj.getSeconds()).padStart(2, "0");
    const fileName = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

    return fileName.trim();
  },
};

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
  fs.writeFileSync(downloadFilePath, JSON.stringify(data, null, 2));
  console.log(`已将照片数据保存到 ${downloadFilePath}`);

  return data;
}

async function downloadFile(photoInfo, albumInfo) {
  let fileUrl = photoInfo.raw || photoInfo.url;
  if (photoInfo.is_video) {
    fileUrl = await Photos.getVideoUrl(albumInfo, photoInfo);
  }

  if (!fileUrl) {
    console.error(`未获取到下载链接，photo.lloc=${photoInfo.lloc}, album.id=${albumInfo.id}`);
    return 
  }

  const albumName = albumInfo.name;
  const photoName = Photos.parsePhotoName(photoInfo)+(photoInfo.is_video?".mp4":".jpg");
  
  const savedFolderPath = path.join(exportDir, albumName);
  if (!fs.existsSync(savedFolderPath)) fs.mkdirSync(savedFolderPath, { recursive: true });

  const savePath = path.join(savedFolderPath, photoName);

  try {
    // 下载图片到本地
    const response = await axios({
      url: fileUrl,
      responseType: "stream",
    });
    response.data.pipe(fs.createWriteStream(savePath));
    console.log(`下载成功：${savePath}`);

    //照片，写入 exif
    if (!photoInfo.is_video) {
      await Tools.sleep(300);

      let exifData = await exifr.parse(savePath);
      if (!exifData || !exifData.DateTimeOriginal) {
        exifData = exifData || {};
        exifData.DateTimeOriginal = Tools.formatExifTime(photoInfo?.exif?.originalTime || photoInfo.rawshoottime || photoInfo.uploadtime);

        exec(`exiftool -overwrite_original -DateTimeOriginal="${exifData.DateTimeOriginal}" "${savePath}"`, (err, stdout, stderr) => {
          if (err) {
            // console.error('写入 Exif 信息失败:', err);
            return;
          }
          console.log(`写入Exif 信息成功: ${savePath}`);
        });
      }
    }
  } catch (error) {
    console.error("downloadFile出现错误：", error);
  }
}

async function start() {
  //初始化 cookie
  COOKIE = (fs.readFileSync("./cookie.txt", "utf8") || "").trim();
  if (!COOKIE) {
    console.error(
      "-----------------------WARNING-----------------------------\n"
    );
    console.error(
      "请登录 qzone.qq.com，然后将 cookie 复制到 cookie.txt 文件内。"
    );
    console.error(
      "\n------------------------------------------------------------"
    );
    return;
  }

  // let data = await downloadData();
  let data = JSON.parse(fs.readFileSync(downloadFilePath));

  for (let i = 0; i < data.length; i++) {
    let album = data[i];

    let photosData = album.photos;
    if (photosData && photosData.length > 0) {
      for (let j = 0; j < photosData.length; j++) {
        let photoInfo = photosData[j];
        await downloadFile(photoInfo, album);
      }
    } else {
      console.log(`相册 ${album.name} 没有照片，跳过。`);
    }
  }
}

start();

// exifr
//   .parse(
//     "/Users/lizhenwen/Desktop/dev_self/qzone-download-photos/export/香港澳门2019年/2022-05-09_05-50-23.jpg"
//   )
//   .then((output) => console.log(output));

// const fileBuffer = fs
//   .readFileSync(
//     "/Users/lizhenwen/Desktop/dev_self/qzone-download-photos/export/psc.jpeg"
//   )

//         let exifObj;

//           // 如果不是标准的 JPEG 文件头，尝试转换为 base64 再处理
//           const base64Data = fileBuffer.toString("base64");
//           const base64Image = `data:image/jpeg;base64,${base64Data}`;
//           exifObj = piexifjs.load(base64Image);

//           console.log(exifObj);