const Config = require('./Config');
const fs = require('fs')
const Multer = require("fastify-multer")
const cp = require('child_process');
const util = require('util');
const { Readable } = require('stream');
const exec = util.promisify(require('child_process').exec);
const sharp = require('sharp');
const mime = require('mime-types');
const Axios = require('axios');
const https = require('https'); 
const path = require('path');
const FormData = require('form-data');
const request = require('request');


const { S3Client, PutObjectCommand, ListObjectsCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  signatureVersion: 'v4',
  region: Config.S3.Region,  // Replace with your actual region
  credentials: {
    accessKeyId: Config.S3.AccessKey,
    secretAccessKey: Config.S3.SecretKey
  }
});

const { Pool } = require('pg');
const pool = new Pool(Config.sqldb);

const storage = Multer.diskStorage({
  filename: function (req, file, cb) {
    const ext = file.originalname.split('.') // get file extension
    cb(null, ext[0])
  }
});

const bulkstorage = Multer.diskStorage({
  filename: function (req, file, cb) {
    const ext = file.originalname.split('.') // get file extension
    cb(null, ext[0] + '-' + Date.now())
  }
});


const createFolderIfNotExists = function (folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
};

const LocalUpload = async function (File, Location, Mode){


  if(Mode=="N"){

    createFolderIfNotExists(Location);

    const extension = mime.extension(File.mimetype);
    let LocalPic = Location+`/${File.filename+'.'+extension}`;
    fs.renameSync(File.path, LocalPic);
    LocalPic = Config.Services.FileService+LocalPic
    LocalPic = LocalPic.replace("/uploads", "");
    const segments = LocalPic.split("/");

    if (segments.length >= 6) {
      segments[4] = encodeURIComponent(segments[4]);
      segments[5] = encodeURIComponent(segments[5]);
    }

    if (segments.length > 8) {
      segments[4] = encodeURIComponent(segments[4]);
      segments[5] = encodeURIComponent(segments[5]);
      segments[7] = encodeURIComponent(segments[7]);
    }

    LocalPic = segments.join("/");

    console.log("dfd", LocalPic);

    return LocalPic;

  }else if (Mode == "C") {
    
    try {
      console.log("modec", File);
      const filename = File.split("/").pop().split("-")[0];
      console.log("filename", filename);
      const response = await Axios.get(File, { responseType: 'arraybuffer' });
      const imageData = Buffer.from(response.data, 'binary');
      const desiredSizeKB = 200;
      const quality = await calculateQuality(desiredSizeKB, imageData.length);

  
      let compressedImageData = await sharp(imageData).jpeg({ quality: quality }).toBuffer();

       
      const timestamp = Date.now();
      const compressedImageFilename = `${filename}-${timestamp}.jpeg`;

      compressedImageFilename = compressedImageFilename.replace("%20", " ");
      createFolderIfNotExists(Location);

      const compressedImagePath = `${Location}/${compressedImageFilename}`;

      fs.writeFileSync(compressedImagePath, compressedImageData);
      let LocalPic = Config.Services.FileService + compressedImagePath;
      LocalPic = LocalPic.replace("/uploads", "");
      const segments = LocalPic.split("/");
      if (segments.length >= 6) {
        segments[4] = encodeURIComponent(segments[4]);
        segments[5] = encodeURIComponent(segments[5]);
      }
  
      if (segments.length > 8) {
        segments[4] = encodeURIComponent(segments[4]);
        segments[5] = encodeURIComponent(segments[5]);
        segments[7] = encodeURIComponent(segments[7]);
      }

      LocalPic = segments.join("/");

      return LocalPic;
    } catch (e) {
      console.log("Error", e.message);
      return File;
    }
  }

}

const BulkLocalUpload = async function (File, Location, Mode) {
  return new Promise((resolve, reject) => {
    
    if (Mode === "N") {
      const imageUrl = File; // Assuming File contains the direct image URL
      const filename = path.basename(imageUrl);
      const localPath = Location + '/' + filename;
      console.log("BulkLocalUpload",localPath)
      createFolderIfNotExists(Location);

      const file = fs.createWriteStream(localPath);
      const request = https.get(imageUrl, function(response) {
        response.pipe(file);
        response.on('end', function() {
          const updatedImageUrl = Config.Services.FileService + localPath.replace("/uploads", "");
          const segments = updatedImageUrl.split("/");

          console.log("sefff", segments, "seddd", segments.length)

          if (segments.length >= 6) {
            segments[4] = encodeURIComponent(segments[4]);
            segments[5] = encodeURIComponent(segments[5]);
          }

          if (segments.length > 8) {
            segments[4] = encodeURIComponent(segments[4]);
            segments[5] = encodeURIComponent(segments[5]);
            segments[6] = encodeURIComponent(segments[6]);
            segments[7] = encodeURIComponent(segments[7]);
            segments[8] = encodeURIComponent(segments[8]);

          }

          let LocalPic = segments.join("/");
          LocalPic = LocalPic.replace("/uploads", "");

          resolve(LocalPic); // Resolve with the LocalPic value
        });
      });
    }else if (Mode == "C") {
      try {
        const filename = File.split("/").pop().split("-")[0];
        return Axios.get(File, { responseType: 'arraybuffer' })
          .then(response => {
            const imageData = Buffer.from(response.data, 'binary');
            const desiredSizeKB = 200;
            return calculateQuality(desiredSizeKB, imageData.length)
              .then(quality => {
                return sharp(imageData)
                  .jpeg({ quality: quality })
                  .toBuffer()
                  .then(compressedImageData => {
                    const timestamp = Date.now();
                    let compressedImageFilename = `${filename}-${timestamp}.jpeg`;
                    compressedImageFilename = compressedImageFilename.replace("%20", " ");
                    createFolderIfNotExists(Location);
                    const compressedImagePath = `${Location}/${compressedImageFilename}`;
                    fs.writeFileSync(compressedImagePath, compressedImageData);
                    let LocalPic = Config.Services.FileService + compressedImagePath;
                    LocalPic = LocalPic.replace("/uploads", "");
                    const segments = LocalPic.split("/");
                    if (segments.length >= 6) {
                      segments[4] = encodeURIComponent(segments[4]);
                      segments[5] = encodeURIComponent(segments[5]);
                    }
                    if (segments.length > 8) {
                      segments[4] = encodeURIComponent(segments[4]);
                      segments[5] = encodeURIComponent(segments[5]);
                      segments[7] = encodeURIComponent(segments[7]);
                    }
                    LocalPic = segments.join("/");
                    resolve(LocalPic) ;
                  });
              });
          });
      } catch (e) {
        console.log("Error", e.message);
        return File;
      }
      
  } else {
      reject(new Error("Invalid Mode")); // Reject with an error for invalid Mode
    }
  });
};



async function calculateQuality(desiredSizeKB, currentSize) {
  const desiredSizeBytes = desiredSizeKB * 1024;
  const quality = Math.floor((desiredSizeBytes / currentSize) * 100);
  return quality < 100 ? quality : 99;
}


const BulkIPFSUpload = async function(File){
  const IpfsUrl = await uploadFileToIPFS(File);
  return IpfsUrl;
}

const uploadFileToIPFS = async (file) => {

  console.log("fgf", file);

  const response = await Axios.get(file, {
    responseType: 'arraybuffer',
  });

  console.log("fgfg", response.data)

  const pinataUrl = 'https://api.pinata.cloud/pinning/pinFileToIPFS';


  const imageUrl = file; // Assuming File contains the direct image URL
 const filename = path.basename(imageUrl);

  const imageBuffer = Buffer.from(response.data, 'binary');

  const formData = new FormData();
  formData.append('file', imageBuffer, {
    filename: filename, // Provide a filename for the image
  });


  const headers = {
      Authorization: `Bearer ${Config.Pinata.Jwt}`,
      'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
      pinata_api_key: Config.Pinata.Key,
      pinata_secret_api_key: Config.Pinata.Secret,
  };
 
  const pinataResponse = await Axios.post(pinataUrl, formData, {
    headers: headers,
  });

  return pinataResponse.data.IpfsHash;
};

const s3Upload = async (Type, file) => {

  try {
    let filename = file.filename + "." + mime.extension(file.mimetype);
    console.log("filename",filename)
    const uploadParams = {
      Bucket: Config.S3.Bucket,
      Key: `${Type}/${filename}`,
      Body: fs.createReadStream(file.path), // Use file.buffer to read the file content
      ACL: 'public-read',
      ContentType: file.mimetype,
    };

  
    const uploadCommand = new PutObjectCommand(uploadParams);
    const uploadResponse = await s3.send(uploadCommand);
    console.log("uploadResponse",uploadResponse)
    if(uploadResponse){
       let imageUrl = `https://${Config.S3.Bucket}.s3.amazonaws.com/${Type}/${filename}`;

       const segments = imageUrl.split("/");

    console.log("dfdf", segments.length, "sd", segments, "s1", segments[1], segments[2]);

    if (segments.length >= 9) {
      segments[6] = encodeURIComponent(segments[6]);
      segments[7] = encodeURIComponent(segments[7]);
    }

    if (segments.length > 10) {
      segments[6] = encodeURIComponent(segments[6]);
      segments[7] = encodeURIComponent(segments[7]);
      segments[8] = encodeURIComponent(segments[8]);
      segments[9] = encodeURIComponent(segments[9]);
    }

    imageUrl = segments.join("/");

    console.log("dfd", imageUrl);

     return imageUrl;
    }

  } catch (err) {
    console.log(err);
  }
  
};

async function downloadImage(url) {
  try {
    const response = await Axios.get(url, { responseType: 'arraybuffer' });
    return response.data;
  } catch (error) {
    console.error('Failed to download image:', error);
    throw error;
  }
}

const Bulks3Upload = async (Type, sourceUrl) => {
  try {
   
    const imageBuffer = await downloadImage(sourceUrl);

    const uploadParams = {
      Bucket: Config.S3.Bucket,
      Key: `${Type}/${filename}`,
      Body: imageBuffer, // Use the readable stream as the Body
      ACL: 'public-read',
      ContentType: 'application/octet-stream',
    };

    const uploadCommand = new PutObjectCommand(uploadParams);
    const uploadResponse = await s3.send(uploadCommand);

    if (uploadResponse) {
      const imageUrl = `https://${Config.S3.Bucket}.s3.amazonaws.com/${Type}/${filename}`;
      return imageUrl;
    }
  } catch (err) {
    console.error(err);
    throw err; // Rethrow the error for handling in your application
  }
};

// Example usage:


const s3CompressedUpload = async (Type, file) => {

  try {
    let filename = `${file.filename.split('.')[0]}-compressed.${mime.extension(file.mimetype)}`;

    const BUCKET = Config.S3.Bucket;

    const compressionOptions = {
      quality: 70, // Adjust the quality as needed (0-100)
      progressive: true, // Use progressive encoding
    };

    const compressedImageBuffer = await sharp(file.path)
    .png(compressionOptions).toBuffer();

    const uploadParams = {
      Bucket: BUCKET,
      Key: `${Type}/${filename}`,
      Body: compressedImageBuffer, // Use file.buffer to read the file content
      ACL: 'public-read',
      ContentType: file.mimetype,
    };

 
    const uploadCommand = new PutObjectCommand(uploadParams);
    const uploadResponse = await s3.send(uploadCommand);

    if(uploadResponse){
      let imageUrl = `https://${Config.S3.Bucket}.s3.amazonaws.com/${Type}/${filename}`;

      const segments = imageUrl.split("/");

   console.log("dfdf", segments.length, "sd", segments, "s1", segments[1], segments[2]);

   if (segments.length > 10) {
    segments[6] = encodeURIComponent(segments[6]);
    segments[7] = encodeURIComponent(segments[7]);
    segments[8] = encodeURIComponent(segments[8]);
    segments[9] = encodeURIComponent(segments[9]);
  }

   else if (segments.length >= 9) {
     segments[6] = encodeURIComponent(segments[6]);
     segments[7] = encodeURIComponent(segments[7]);
   } else{

   }
  
   imageUrl = segments.join("/");

   console.log("dfd", imageUrl);

    return imageUrl;
   }


 

  } catch (err) {
    console.log(err);
  }
 
};

const Bulks3CompressedUpload = async (Type, sourceUrl) => {
  try {
    // Extract the filename from the source URL
    const filename = sourceUrl.substring(sourceUrl.lastIndexOf('/') + 1);

    const BUCKET = Config.S3.Bucket;

    const compressionOptions = {
      quality: 70, // Adjust the quality as needed (0-100)
      progressive: true, // Use progressive encoding
    };

    // Fetch the file content from the source URL using the 'request' library
    const compressedImageBuffer = await request(sourceUrl, { encoding: null });

    const uploadParams = {
      Bucket: BUCKET,
      Key: `${Type}/${filename}`,
      Body: compressedImageBuffer,
      ACL: 'public-read',
      // You may need to set the ContentType based on the file type
      ContentType: 'image/png', // Example content type; change as needed
    };

    const uploadCommand = new PutObjectCommand(uploadParams);
    const uploadResponse = await s3.send(uploadCommand);

    if (uploadResponse) {
      const imageUrl = `https://${BUCKET}.s3.amazonaws.com/${Type}/${filename}`;
      return imageUrl;
    }
  } catch (err) {
    console.error(err);
    throw err; // Rethrow the error for handling in your application
  }
};

// Example usage:


const GiftMetaJson = async (Data) => {
  try {
    let FileName = Data.TokenId;
    let MetaName = FileName + '.json';

    let MetaData = {
      "name": Data.Name,
      "image": Data.Media
    };

    let JsonData = JSON.stringify(MetaData);

    let Key = `uploads/MetaData/GiftNft/${Data.Folder}/${MetaName}`;

    fs.writeFileSync(MetaName, JsonData);

    const params = {
      Bucket: Config.S3.Bucket,
      Key: Key,
      Body: fs.createReadStream(MetaName), // Use a readable stream of the local file
      ACL: 'public-read',
      ContentType: 'application/json'
    };

    const uploadCommand = new PutObjectCommand(params);
    const uploadResponse = await s3.send(uploadCommand);

    if (uploadResponse) {
      const imageUrl = `https://${Config.S3.Bucket}.s3.amazonaws.com/${Key}`;
      fs.unlinkSync(MetaName)
      return imageUrl;
    }
  } catch (error) {
    console.error(error);
    throw error; // Rethrow the error for handling in your application
  }
};

async function MetaJson(Data) {
  let FileName = Data.TokenId;
  let MetaName = FileName + '.json';

  let MetaData = {
    "name": Data.Name,
    "description": Data.Description,
    "image": Data.Media
  };

  const collectionQuery = 'SELECT * FROM "Collections" WHERE "Name" = $1';
  const collectionValues = [Data.CollectionName];
  const collectionResult = await pool.query(collectionQuery, collectionValues);
  const CollectionData = collectionResult.rows[0];

  const userQuery = 'SELECT "UserName" FROM "Users" WHERE "_id" = $1';
  const userValues = [CollectionData.AuthorId];
  const userResult = await pool.query(userQuery, userValues);
  const userData = userResult.rows[0];
  const userName = userData.UserName;


  let JsonData = JSON.stringify(MetaData);

  let Key = `uploads/Collections/${userName}/${CollectionData.ContractSymbol}/MetaData/${MetaName}`;

  fs.writeFileSync(MetaName, JsonData);

  const params = {
    Bucket: Config.S3.Bucket,
    Key: Key,
    Body: fs.createReadStream(MetaName), 
    ACL: 'public-read',
    ContentType: 'application/json'
  };

  const uploadCommand = new PutObjectCommand(params);
  const uploadResponse = await s3.send(uploadCommand);

  if (uploadResponse) {
    const imageUrl = `https://${Config.S3.Bucket}.s3.amazonaws.com/${Key}`;
    fs.unlinkSync(MetaName)
    return imageUrl;
  }


}

const localDirectory = './uploads/downloads'; // Local directory to store downloaded files

const downloadS3Directory = async (bucketName, s3DirectoryKey) => {
  
  const params = {
    Bucket: bucketName,
    Prefix: s3DirectoryKey
  };

  try {
    const uploadCommand = new ListObjectsCommand(params);
    const s3Objects = await s3.send(uploadCommand);

    if (!fs.existsSync(localDirectory)) {
      fs.mkdirSync(localDirectory, { recursive: true }); // Ensure the local directory exists
    }

    for (const s3Object of s3Objects.Contents) {
      const s3ObjectParams = {
        Bucket: bucketName,
        Key: s3Object.Key
      };

      const getObjectParams = new GetObjectCommand(s3ObjectParams);
      const { Body } = await s3.send(getObjectParams);
      const filePath = `${localDirectory}/${s3Object.Key}`;

      // Create directories recursively if they don't exist
      const directoryPath = path.dirname(filePath);
      if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
      }

      fs.writeFileSync(filePath, Body.toString());
    }
  } catch (error) {
    throw error;
  }
};


async function GiftIpfsCID(CollectionName) {
  try {
    const s3DirectoryKey = `uploads/MetaData/GiftNft/${CollectionName}`;
    await downloadS3Directory(Config.S3.Bucket, s3DirectoryKey);

    const ipfsAddCommand = `ipfs add --pin=true -r ${localDirectory}`;
    const { stdout, stderr } = await exec(ipfsAddCommand);

    console.log('stderr:', stderr);
    console.log('stdout:', stdout);

    const addedArray = stdout.split("added ");
    addedArray.shift();
    const cidsArray = addedArray.map((addedString) => addedString.split(" ")[0]);
    const lastElement = cidsArray[cidsArray.length - 1];
    console.log("lastElement:", lastElement);

    // Clean up the local directory (optional)
    fs.rmSync(localDirectory, { recursive: true });

    return lastElement; // Return the IPFS CID as the response
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

async function IpfsUpload(CollectionName) {
  try {
    
    const collectionQuery = 'SELECT * FROM "Collections" WHERE "Name" = $1';
    const collectionValues = [CollectionName];
    const collectionResult = await pool.query(collectionQuery, collectionValues);
    const CollectionData = collectionResult.rows[0];

    const userQuery = 'SELECT "UserName" FROM "Users" WHERE "_id" = $1';
    const userValues = [CollectionData.AuthorId];
    const userResult = await pool.query(userQuery, userValues);
    const userData = userResult.rows[0];
    const userName = userData.UserName;

    
    const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;

    const s3ObjectKeyPrefix = `uploads/Collections/${userName}/${CollectionData.ContractSymbol}/MetaData`;  

    const listObjectsParams = {
      Bucket: Config.S3.Bucket,
      Prefix: s3ObjectKeyPrefix,
    };

    try {
      
      const listObjectsCommand = new ListObjectsCommand(listObjectsParams);
      const { Contents: s3ObjectList } = await s3.send(listObjectsCommand);

      const data = new FormData();

      for (const s3Object of s3ObjectList) {

        const objectKey = s3Object.Key;
        const getObjectParams = {
          Bucket: Config.S3.Bucket,
          Key: objectKey,
        };
        const getObjectCommand = new GetObjectCommand(getObjectParams);
        const { Body: fileData } = await s3.send(getObjectCommand);

        data.append(`file`, fileData, {
          filepath: `${CollectionName}/${path.basename(objectKey)}`,
          contentType: 'application/octet-stream',
        });

      }

      const response = await Axios.post(url, data, {
        headers: {
          "Content-Type": `multipart/form-data; boundary=${data._boundary}`,
          "Authorization": "Bearer " + Config.Pinata.Jwt,
        },
      });

      getipfsHast = `https://testipfs.mypinata.cloud/ipfs/${response.data.IpfsHash}`;
      ipfsHash = `https://ipfs.io/ipfs/${response.data.IpfsHash}`;
      let ipfsdata = {
        ipfsHash: ipfsHash,
        cid: response.data.IpfsHash
      }
  
      const infoQuery = 'SELECT * FROM "MetaData" WHERE "MediaName" = $1';
      const infoValues = [CollectionName];
      const infoResult = await pool.query(infoQuery, infoValues);
      const info = infoResult.rows[0];
  
      if (!info) {
        const insertMetaDataQuery = `INSERT INTO "MetaData" ("MediaName","MediaIpfsUrl","MediaIpfs") Values ($1,$2,$3)`;
        const insertMetaDataValues = [CollectionName, getipfsHast, ipfsHash];
        await pool.query(insertMetaDataQuery, insertMetaDataValues);
  
      } else {
        const updateMetaDataQuery = `UPDATE "MetaData" SET "MediaName" = $1, "MediaIpfsUrl" = $2, "MediaIpfs" = $3  WHERE "_id" = $4`;
        const updateMetaDataValues = [CollectionName, getipfsHast, ipfsHash, info._id];
        await pool.query(updateMetaDataQuery, updateMetaDataValues);
  
      }
      
      return ipfsdata;



    } catch (error) {
        console.log("error", error)
    }

 

   
  } catch(e){
    console.log(e)
  }
}

async function IpfsCID(CollectionName) {

  console.log("IpfsCIDtest")
  const collectionQuery = 'SELECT * FROM "Collections" WHERE "Name" = $1';
  const collectionValues = [CollectionName];
  const collectionResult = await pool.query(collectionQuery, collectionValues);
  const CollectionData = collectionResult.rows[0];

  const userQuery = 'SELECT "UserName" FROM "Users" WHERE "_id" = $1';
  const userValues = [CollectionData.AuthorId];
  const userResult = await pool.query(userQuery, userValues);
  const userData = userResult.rows[0];
  const userName = userData.UserName;
  console.log("IpfsCIDtest1", userName)
  const s3DirectoryKey = `uploads/Collections/${userName}/${CollectionData.ContractSymbol}/MetaData`;
  await downloadS3Directory(Config.S3.Bucket, s3DirectoryKey);
  console.log("s3DirectoryKey", s3DirectoryKey, localDirectory)
  const ipfsAddCommand = `ipfs add --pin=true -r ${localDirectory}`;

  const { stdout, stderr } = await exec(ipfsAddCommand);

  console.log('stderr:', stderr);
  console.log('stdout:', stdout);

  const addedArray = stdout.split("added ");
  addedArray.shift();
  const cidsArray = addedArray.map((addedString) => addedString.split(" ")[0]);
  const lastElement = cidsArray[cidsArray.length - 1];
  // Clean up the local directory (optional)
  fs.rmSync(localDirectory, { recursive: true });

  return lastElement; // Return the IPFS CID as the response


}

exports.storage = storage;
exports.bulkstorage = bulkstorage;
exports.s3Upload = s3Upload;
exports.GiftMetaJson = GiftMetaJson;
exports.MetaJson = MetaJson;
exports.GiftIpfsCID = GiftIpfsCID;
exports.IpfsCID = IpfsCID;
exports.s3CompressedUpload = s3CompressedUpload;
exports.LocalUpload = LocalUpload;
exports.BulkLocalUpload = BulkLocalUpload;
exports.Bulks3Upload = Bulks3Upload;
exports.BulkIPFSUpload = BulkIPFSUpload;
exports.Bulks3CompressedUpload = Bulks3CompressedUpload;
exports.IpfsUpload = IpfsUpload;


