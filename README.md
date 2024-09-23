# qzone-download-photos

## 功能
下载 qzone 照片，同时会把拍照时间写入EXIF

逻辑：

  优先下载原图，没有原图就下载大图
  
  如果 exif 信息里面缺少拍照时间，就将拍照时间或者上传时间写入 exif（一般原图会含有 exif 信息）

  照片使用拍照时间来命名，按相册进行目录分类

  **下载完最好检查下，将异常的图片删掉，然后重下一遍**

## 前置准备

如果需要写入 exif，请先安装`exiftool`：

windows 直接去官网下载： https://exiftool.org/

mac 执行`brew install exiftool`

不安装的话不会写入 exif，不影响下载

## 使用

1. 将仓库 `git clone` 到本地

2. 登录QQ空间，然后F12 打开控制台，执行`alert(document.cookie)` ，将cookie文本内容复制粘贴到 `./cookie.txt` 里面

3. 进入仓库目录，执行：
```
# 安装依赖
npm install

# 执行下载
npm run start
```

4. 图片会下载到 `./export` 目录
