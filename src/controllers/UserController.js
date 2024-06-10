const Multer = require("fastify-multer");
const cp = require('child_process');
const fs = require('fs');
const fsipfs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const Axios = require('axios');
const { storage, bulkstorage, LocalUpload, s3Upload, s3CompressedUpload, BulkLocalUpload, BulkIPFSUpload, GiftMetaJson, MetaJson, GiftIpfsCID, IpfsCID, Bulks3Upload, Bulks3CompressedUpload, IpfsUpload } = require("../Helper");
const config = require('../Config');

const { S3Client, PutObjectCommand, ListObjectsCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  signatureVersion: 'v4',
  region: config.S3.Region,  // Replace with your actual region
  credentials: {
    accessKeyId: config.S3.AccessKey,
    secretAccessKey: config.S3.SecretKey
  }
});


const { Pool } = require('pg');
const pool = new Pool(config.sqldb);

const SingleImageUpload = Multer({ storage: storage });
let SingleImageUpdate = SingleImageUpload.single('Image')

const BulkImageUpload = Multer({ storage: bulkstorage });
let BulkImageUpdate = BulkImageUpload.single('Image')

const S3ImageUploader = async (req, res) => {
  try {
    const { file } = req;
   console.log("file",file)
    if (!file) {
      return res.code(200).send({
        status: false,
        message: "Image is required",
      });
    }

    const ThumbImage = file.filename;

    let s3Image;
    let s3CImage;

    let location = req.body.Location

    if (ThumbImage) {   
               
        s3Image = await s3Upload(location, file);
        console.log("s3Image",s3Image)
        if (location == "uploads/CoverVideo" || location == "uploads/LandingSection1" || location == "uploads/CSVSample") {
          s3CImage = s3Image;
        }else{
          s3CImage = await s3CompressedUpload(location, file);
        }


        return res.code(200).send({
        status: true,
        s3Image: s3Image,
        s3CImage: s3CImage,
        message: "Image Uploaded Successfully",
      });
    } else {
      return res.code(403).send({
        status: false,
        info: "Something Went Wrong",
      });
    }
  } catch (error) {
    console.log("error-/S3ImageUploader", error);
    return res.code(500).send({
      status: false,
      message: "Error Occurred",
      error: error.message,
    });
  }
};

const SingleImageUploaderForBulk = async (req, res) => {
  console.log("upload file",req.body)
  try {

    const { ImageUrl, Location } = req.body;
   
    if (!ImageUrl) {
      return res.code(200).send({
        status: false,
        message: "Image url is required",
      });
    }

    let s3Image;
    let s3CImage;

    if (ImageUrl) {  
        s3Image = await Bulks3Upload(Location, ImageUrl);
        s3CImage = await Bulks3CompressedUpload(Location, Local);
        console.log("CLocal", CLocal)
        const s3 = {
          s3Image,
          s3CImage
        };

      return res.code(200).send({
        status: true,
        Image: s3,
        message: "Image Uploaded Successfully",
      });
    } else {
      return res.code(403).send({
        status: false,
        info: "Something Went Wrong",
      });
    }
  } catch (error) {
    console.log("error-/SingleImageUploaderForBulk", error);
    return res.code(500).send({
      status: false,
      message: "Error Occurred",
      error: error.message,
    });
  }
};

const IPFSUploaderForBulk = async (req, res) => {
  try {

    const { ImageUrl } = req.body;

    if (!ImageUrl) {
      return res.code(200).send({
        status: false,
        message: "Image url is required",
      });
    }

    if (ImageUrl) {  

        Local = await BulkIPFSUpload(ImageUrl);
       return res.code(200).send({
        status: true,
        Image: Local,
        message: "Image Uploaded Successfully",
      });
    } else {
      return res.code(403).send({
        status: false,
        info: "Something Went Wrong",
      });
    }
  } catch (error) {
    console.log("error-/IPFSUploaderForBulk", error);
    return res.code(500).send({
      status: false,
      message: "Error Occurred",
      error: error.message,
    });
  }
};

const MetaJsonUpdate = async (req, res) => {
  try {
    let Data = req.body
    console.log("Data", Data)
    let result = await MetaJson(Data)
    //console.log("result", result)
    return res.code(200).send({
      status: true,
      MetaJson: result,
      message: "MetaJson created Successfully",
    });
  } catch (error) {
    console.log("error-/MetaJsonUpdate", error);
    return res.code(500).send({
      status: false,
      message: "Error Occurred",
      error: error.message,
    });
  }
};

const GiftMetaJsonUpdate = async (req, res) => {
  try {

    let Data = req.body
    let result = await GiftMetaJson(Data)
    return res.code(200).send({
      status: true,
      MetaJson: result,
      message: "MetaJson created Successfully",
    });
  } catch (error) {
    console.log("error-/GiftMetaJsonUpdate", error);
    return res.code(500).send({
      status: false,
      message: "Error Occurred",
      error: error.message,
    });
  }
};

const IpfsCIDUpdate = async (req, res) => {
  try {
    console.log("IpfsCIDUpdate")
    let Data = req.body.Data
    let result = await IpfsCID(Data)

    return res.code(200).send({
      status: true,
      IpfsCID: result,
      message: "IpfsCID created Successfully",
    });
  } catch (error) {
    console.log("error-/IpfsCIDUpdate", error);
    return res.code(500).send({
      status: false,
      message: "Error Occurred",
      error: error.message,
    });
  }
};

const GiftIpfsCIDUpdate = async (req, res) => {
  try {
    let Data = req.body.Data
    let result = await GiftIpfsCID(Data)

    return res.code(200).send({
      status: true,
      IpfsCID: result,
      message: "IpfsCID created Successfully",
    });
  } catch (error) {
    console.log("error-/GiftIpfsCIDUpdate", error);
    return res.code(500).send({
      status: false,
      message: "Error Occurred",
      error: error.message,
    });
  }
};

const IpfsUploadUpdate = async (req, res) => {
  try {
    let Data = req.body.Data
    let result = await IpfsUpload(Data)
    return res.code(200).send({
      status: true,
      IpfsCID: result,
      message: "IpfsCID created Successfully",
    });
  } catch (error) {
    console.log("error-/IpfsUploadUpdate", error);
    return res.code(500).send({
      status: false,
      message: "Error Occurred",
      error: error.message,
    });
  }
};

const IpfsUnpinUpdate = async (req, res) => {
  try {
    let Data = req.body.Data
    let result = await IpfsUnpin(Data)

    return res.code(200).send({
      status: true,
      IpfsCID: result,
      message: "IpfsCID created Successfully",
    });
  } catch (error) {
    console.log("error-/IpfsUnpinUpdate", error);
    return res.code(500).send({
      status: false,
      message: "Error Occurred",
      error: error.message,
    });
  }
};

async function IpfsUnpin(cid) {
   
  // Prepare the request data for unpinning the CID
  var data = {
    method: 'delete',
    url: `https://api.pinata.cloud/pinning/unpin/${cid}`,
    headers: { 
      'Authorization': "Bearer " + config.Pinata.Jwt
    }
  };
  
  // Send the request to Pinata API to unpin the CID
  await Axios(data);

  return true;
}

module.exports = { SingleImageUpdate, BulkImageUpdate, MetaJsonUpdate, IpfsCIDUpdate, IpfsUploadUpdate, IpfsUnpinUpdate, GiftMetaJsonUpdate, GiftIpfsCIDUpdate, SingleImageUploaderForBulk, S3ImageUploader, IPFSUploaderForBulk  }