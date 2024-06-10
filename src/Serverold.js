const fastify = require('fastify')({
  logger: true,
});

// Required modules
const rateLimit = require('fastify-rate-limit');
const config = require('./Config');
const path = require('path');
fastify.register(require('@fastify/cors'), { origin: '*' });
fastify.register(require('fastify-multer').contentParser);
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'uploads'),
  prefix: '/',
});
fastify.register(require('fastify-cookie'));

fastify.register(rateLimit, {
  max: 1000000, // Maximum number of requests allowed within the duration
  timeWindow: '1 minute', // Duration of the time window
  trustProxy: true, // Enable trust for the proxy server
  keyGenerator: (request) => {
    // Use the "X-Forwarded-For" header to get the client's IP address
    const ipAddress = request.headers['x-forwarded-for'] || request.ip;
    return ipAddress; // Use the client's IP address as the rate limit key
  },
});

async function rateLimitAccess(request, reply) {
  try {
    if (request.rateLimit) {
      reply.code(401).send({
        status: false,
        response: 'Rate limit exceeded. Please try again later.',
      });
    }
  } catch (error) {
    reply.send(error);
  }
}

const { Pool } = require('pg');
const pool = new Pool(config.sqldb);
const cron = require('node-cron');
const Web3 = require('web3')
const Axios = require("axios");
const reader = require('xlsx')
const fs = require('fs');
const csv = require('csv-parser');
let Config = require("./Config");
const requiredFields = [
  "Title",
  "CreationYear",
  "Currency",
  "Category",
  "PhysicalEdition",
  "DigitalEdition",
  "Publisher",
  "Dimension",
  "Width",
  "Height",
  "Unique",
  "PhysicalPrice",
  "DigitalPrice",
  "PriceNegotiation",
  "Series",
  "Color",
  "Orientation",
  "Condition",
  "Signature",
  "Description",
  "Thumb",
  "Media",
  "Material",
  "Style",
  "Subject",
  "Keywords"
];

const prequiredFields = [
  "Title",
  "CreationYear",
  "Currency",
  "ProductCategory",
  "PhysicalEdition",
  "DigitalEdition",
  "PhysicalPrice",
  "DigitalPrice",
  "PriceNegotiation",
  "Description",
  "Thumb",
  "Media"
];

async function UploadImage(UserInfo, CollectionInfo, ItemName, File, Type) {

  // let S3 = "";
  let IPFS = "";

  let ImageInfo = {
    "Location": "uploads/Collections/" + UserInfo.UserName + "/" + CollectionInfo.ContractSymbol + "/Items/" + ItemName + "/" + Type,
    "ImageUrl": File
  }
  // console.log("Data",Config.Services.FileService,ImageInfo);

  // let s3Store = await Axios.post(Config.Services.FileService + "ImageUrlUpload", ImageInfo);

  // S3 = s3Store.data.Image;

  let IpfsUrl = await Axios.post(Config.Services.FileService + "ImageUrlIPFSUpload", ImageInfo);
  IPFS = "https://ipfs.io/ipfs/" + IpfsUrl.data.Image;

  const Data = {
    "IPFS": IPFS
  };

  return Data;


}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

pool.on('connect', () => {
  //console.log('Connected to the database');
});

pool.on('error', (err) => {
  console.error('Error connecting to the database:', err);
  pool.end(); // Close the pool in case of an error
});

fastify.decorate('ratelimit', rateLimitAccess);

// Register routes
fastify.register(require('./routes/FileRoutes'));

// Start the server
const start = async () => {
  try {
    await fastify.listen(config.server.port, '0.0.0.0');

    cron.schedule('*/1 * * * *', async () => {
      
      try {
        const networkResults = await pool.query(`SELECT * FROM "Networks"`);
        for (const network of networkResults.rows) {

          let AdminInfo = (await pool.query('SELECT * FROM "AdminBalanceDetails" WHERE "Currency" = $1 LIMIT 1;', [network.Currency])).rows[0];

          if (AdminInfo) {
            //console.log('Connecting to Ethereum node at:', network.RpcUrl);

            try {
              const web3 = new Web3(new Web3.providers.HttpProvider(network.RpcUrl));

              const address = network.AdminAddress;

              try {
                const balance = await web3.eth.getBalance(address);
                const balanceInEther = web3.utils.fromWei(balance, 'ether');

                // Check if balance is <= 0.1 and email variable is false
                if (balanceInEther <= 0.1 && !AdminInfo.Mail) {
                  const mail_sent = await Axios.post(Config.Services.EmailService + "/TopupNotifyEmail", {
                    WalletAddress: network.AdminAddress,
                    Currency: network.Currency
                  });

                  if (mail_sent.status) {
                    // Email sent successfully, update the email variable to true
                    await pool.query(
                      `UPDATE "AdminBalanceDetails" SET "Mail" = TRUE WHERE "Currency" = $1`,
                      [network.Currency]
                    );
                  }
                } else if (balanceInEther > 0.1 && AdminInfo.Mail) {
                  // Balance is > 0.1 and email variable is true, update it to false
                  await pool.query(
                    `UPDATE "AdminBalanceDetails" SET "Mail" = FALSE WHERE "Currency" = $1`,
                    [network.Currency]
                  );
                }

                // Update the balance in the database
                const query = `UPDATE "AdminBalanceDetails" SET "Balance" = $1, "WalletAddress" = $3 WHERE "Currency" = $2`;
                const values = [balanceInEther, network.Currency, network.AdminAddress];
                await pool.query(query, values);

                //console.log("Update successful");
              } catch (error) {
                console.error('Error:', error);
              }

            } catch (error) {
              console.error('Error initializing Web3:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching balances', error);
      }
    });

    /* Bulk ArtWork */

   //cron.schedule('*/30 * * * * ', async () => {
  cron.schedule('*/30 * * * * * ', async () => {
      console.log("bulkartwork******************")
      try {
        const query = `SELECT * FROM "TempCsv" WHERE "Type" = 'Artwork' AND "Status" = false ORDER BY _id DESC;`;
        const result = await pool.query(query);
        const TempCsvData = result.rows;

        if (TempCsvData.length === 0) {
          console.log("No Data Available for Processing Bulk Update Artwork");
          return;
        }

        for (const tempdata of TempCsvData) {

          let CollectionId = tempdata.CollectionId;
          let UserId = tempdata.AuthorId;
          let UserInfo = (await pool.query('SELECT * FROM "Users" WHERE _id = $1 LIMIT 1;', [UserId])).rows[0];
          let CollectionInfo = (await pool.query('SELECT * FROM "Collections" WHERE _id = $1 LIMIT 1;', [CollectionId])).rows[0];
          let Thumb = tempdata.Thumb;
          let Media = tempdata.Media;
          let Type = tempdata.Type;
          const FileUrl = tempdata.FilePath;
          console.log("dfd", FileUrl)
          const data = [];


          await Axios.get(FileUrl).then((response) => {

            const csvData = response.data;

            csv().on('data', (row) => {
              console.log("dfd", row);
              data.push(row);
            })
              .on('end', () => {
                console.log(data);
              })
              .write(csvData);
          })
            .catch((error) => {
              console.error('Error downloading or processing the CSV file:', error);
            });

          let latestTokenId = 0;
          const Tresult = await pool.query('SELECT * FROM "ArtItems" WHERE "CollectionId" = $1 ORDER BY "TokenId" DESC LIMIT 1', [CollectionId]);
          const findLatestTokenId = Tresult.rows[0];


          if (findLatestTokenId) {
            latestTokenId = Number(findLatestTokenId.TokenId) + 1;
          }

          let i = 0;
          const invalidItems = [];

          for (const elemnt of data) {


            let FieldValidate = true;

            let ItemName = elemnt.Title;
            let ItemThumb = elemnt.Thumb;
            let ItemMedia = elemnt.Media;

            const imageExtensionsRegex = /\.(jpg|jpeg|png|gif|bmp)$/i;
            const isThumbImage = imageExtensionsRegex.test(ItemThumb);
            const isMediaImage = imageExtensionsRegex.test(ItemMedia);

            if (!isThumbImage || !isMediaImage) {
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            console.log("herrr");

            if (ItemName.length < 3 || ItemName.length > 255) {
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }


            let MatchingThumb = Thumb.find(url => {
              let thumbExtension = url.split('.').pop();
              let thumbFilename = url.split('/').pop().split('-')[0];
              return (
                thumbFilename === ItemThumb ||
                thumbFilename === ItemThumb.replace('.png', '') ||
                thumbFilename === ItemThumb.replace('.jpg', '') ||
                thumbFilename === ItemThumb.replace('.jpeg', '') ||
                thumbFilename === ItemThumb.replace('.jpeg', '.jpg') ||
                thumbFilename === ItemThumb.replace('.jpg', '.jpeg') ||
                (thumbExtension === 'jpg' && (ItemThumb.endsWith('.jpg') || ItemThumb.endsWith('.jpeg')))
              );
            });


            let MatchingMedia = Media.find(url => {
              let mediaExtension = url.split('.').pop();
              let mediaFilename = url.split('/').pop().split('-')[0];
              return (
                mediaFilename === ItemMedia ||
                mediaFilename === ItemMedia.replace('.png', '') ||
                mediaFilename === ItemMedia.replace('.jpg', '') ||
                mediaFilename === ItemMedia.replace('.jpeg', '') ||
                mediaFilename === ItemMedia.replace('.jpeg', '.jpg') ||
                mediaFilename === ItemMedia.replace('.jpg', '.jpeg') ||
                (mediaExtension === 'jpg' && (ItemMedia.endsWith('.jpg') || ItemMedia.endsWith('.jpeg')))
              );
            });

            console.log("MT", MatchingThumb, "Item", ItemName);
            console.log("MM", MatchingMedia, "Item", ItemName);

            //  return false;

            if (!MatchingThumb || !MatchingMedia) {
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            // const hasAllFields = requiredFields.every(field => {

            //   const fieldValue = elemnt[field];

            //   if (typeof fieldValue === 'boolean') {
            //     return fieldValue !== undefined;
            //   }

            //   if (typeof fieldValue === 'number') {
            //     return !isNaN(fieldValue);
            //   }

            //   return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
            // });

            // if (!hasAllFields) {
            //    FieldValidate = false;
            //    invalidItems.push(ItemName);
            //    continue;
            // }

            const Title = (await pool.query('SELECT * FROM "ArtItems" WHERE "Title" = $1 LIMIT 1;', [elemnt.Title])).rows[0];
            if (Title) {
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }


            const CreationYear = Number(elemnt.CreationYear);
            if (isNaN(CreationYear) || CreationYear < 1000 || CreationYear > 9999) {
              console.log("Invalid Year", elemnt.CreationYear);
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }


            const Category = (await pool.query('SELECT * FROM "Categories" WHERE "Title" = $1 LIMIT 1;', [elemnt.Category])).rows[0];
            if (!Category) {
              console.log("Invalid Category");
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            if (elemnt.Dimension !== "IN" && elemnt.Dimension !== "CM") {
              console.log("Invalid IN / CM ");
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            if (elemnt.Panel && elemnt.Panel !== "Single" && elemnt.Panel !== "Multiple") {
              console.log("Invalid Panel");
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }


            if (elemnt.PackageDimension && elemnt.PackageDimension !== "IN" && elemnt.PackageDimension !== "CM") {
              console.log("Invalid Package Dimension");
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            if (elemnt.PackageWeight && elemnt.PackageWeight !== "KG" && elemnt.PackageWeight !== "LB") {
              console.log("Invalid Package Weight");
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }


            let KeywordsId = [];
            let StyleId = [];
            let SubjectId = [];
            let MaterialId = [];

            const Materials = elemnt.Material.split(",").map(material => material.trim()).filter(material => material !== "");
            const Keywords = elemnt.Keywords.split(",").map(keyword => keyword.trim()).filter(keyword => keyword !== "");
            const Styles = elemnt.Style.split(",").map(style => style.trim()).filter(style => style !== "");
            const Subjects = elemnt.Subject.split(",").map(subj => subj.trim()).filter(subj => subj !== "");


            for (const value of Materials) {
              const matchingMaterial = (await pool.query('SELECT * FROM "Materials" WHERE "Title" = $1 LIMIT 1;', [value])).rows[0];
              if (matchingMaterial) {
                MaterialId.push(matchingMaterial._id);
              } else {
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }


            for (const value of Keywords) {
              const matchingKeywd = (await pool.query('SELECT * FROM "KeyWords" WHERE "Title" = $1 LIMIT 1;', [value])).rows[0];

              if (matchingKeywd) {
                KeywordsId.push(matchingKeywd._id);

              } else {
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }

            for (const value of Styles) {
              const matchingstyle = (await pool.query('SELECT * FROM "Style" WHERE "Title" = $1 LIMIT 1;', [value])).rows[0];

              if (matchingstyle) {
                StyleId.push(matchingstyle._id);
              } else {
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }

            for (const value of Subjects) {
              const matchingsubject = (await pool.query('SELECT * FROM "Medium" WHERE "Title" = $1 LIMIT 1;', [value])).rows[0];
              if (matchingsubject) {
                SubjectId.push(matchingsubject._id);
              } else {
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }


            let TokenId;
            if (findLatestTokenId) {
              TokenId = latestTokenId;
              latestTokenId++;
            } else {
              TokenId = i;
              i++;
            }


            let ThumbUpload = await UploadImage(UserInfo, CollectionInfo, ItemName, MatchingThumb, "Thumb");

            let MediaUpload = await UploadImage(UserInfo, CollectionInfo, ItemName, MatchingMedia, "Media");

            if (!ThumbUpload || !MediaUpload) {
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }


            if (!MediaUpload.IPFS) {
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            const Ipfsinfo = await Axios.post(Config.Services.FileService + "IpfsUpload", { 'Data': CollectionInfo.Name });
            const MetaDataIpfs = Ipfsinfo.data.IpfsCID;

            if (MetaDataIpfs) {

              if (CollectionInfo.IPFSCid && CollectionInfo.IPFSCid !== MetaDataIpfs.cid) {
                const IpfsRemove = await Axios.post(Config.Services.FileService + "IpfsUnpin", { 'Data': CollectionInfo.IPFSCid });
              }


              await pool.query(`UPDATE "Collections" SET "IPFSCid" = $1, "IPFSHash" = 'https://ipfs.io/ipfs/' || $2          WHERE _id = $3`, [MetaDataIpfs.cid, MetaDataIpfs.cid, CollectionInfo._id]);


            }

            const Edition = parseInt(elemnt.PhysicalEdition) + parseInt(elemnt.DigitalEdition);

            const ArtTitle = (await pool.query('SELECT * FROM "ArtItems" WHERE "Title" = $1 LIMIT 1;', [elemnt.Title])).rows[0];

            let ArtInsId = null;

            if (!ArtTitle) {

              const insertArtQuery = `
          INSERT INTO "ArtItems" (
            "Title", "CreationYear", "Packaging", "Category", "Type", "Edition", "Unique", 
            "PhysicalEdition", "DigitalEdition", "Publisher", "Dimension", "Height", "Material", 
            "Style", "Keywords", "Subject", "Width", "PackageHeight",
            "PackageWidth", "Framed", "Panel", "PackageDimension", "PackageWeight", 
            "PackageWeightValue", "PhysicalPrice", "DigitalPrice", "ReceivedPhysicalPrice", 
            "ReceivedDigitalPrice", "PriceTransparency", "ReceiveCurrency", "Currency", 
            "PriceDisplay", "AutoRejectOffers", "AutoAcceptOffers", "Depth", "PackageDepth", 
            "Description", "AuthorId",  "CollectionId", "Color", "Orientation", 
            "Series", "Signature", "Condition", "Thumb", "Media", "IPFSThumb", "IPFSMedia", 
             "TokenId", "Steps", "ThumbOrg", "MediaOrg"
          ) 
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 
            $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, 
            $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48 , $49 , $50, $51, $52
          ) 
          RETURNING "_id";
        `;

              const insertArtValues = [
                elemnt.Title, CreationYear, elemnt.Packaging, Category._id, Type, Edition,
                elemnt.Unique, elemnt.PhysicalEdition, elemnt.DigitalEdition, elemnt.Publisher,
                elemnt.Dimension, elemnt.Height, MaterialId, StyleId, KeywordsId, SubjectId,
                elemnt.Width, elemnt.PackageHeight, elemnt.PackageWidth, elemnt.Framed,
                elemnt.Panel, elemnt.PackageDimension, elemnt.PackageWeight,
                elemnt.PackageWeightValue, 0, 0, elemnt.PhysicalPrice, elemnt.DigitalPrice,
                elemnt.PriceNegotiation, elemnt.Currency, CollectionInfo.Currency,
                elemnt.PriceDisplay, elemnt.AutoRejectOffers, elemnt.AutoAcceptOffers,
                elemnt.Depth, elemnt.PackageDepth, elemnt.Description, UserId,
                CollectionId, elemnt.Color, elemnt.Orientation, elemnt.Series,
                elemnt.Signature, elemnt.Condition, MatchingThumb, MatchingMedia,
                ThumbUpload.IPFS, MediaUpload.IPFS, TokenId, 5, MatchingThumb, MatchingMedia
              ];
              console.log("File url", insertArtQuery, insertArtValues)
              const result = await pool.query(insertArtQuery, insertArtValues);
              ArtInsId = result.rows[0]._id;

              for (let i = 0; i < Edition; i++) {
                let Edition = i + 1;
                let isPhysicalArt = i < elemnt.PhysicalEdition;
                let price = 0;

                const selectEditionQuery = `SELECT COUNT(*) AS count
            FROM "Editions" WHERE "ItemId" = $1 AND "Edition" = $2; `;
                const selectEditionValues = [ArtInsId, Edition];
                const result = await pool.query(selectEditionQuery, selectEditionValues);
                const infoExists = result.rows[0].count > 0;

                if (!infoExists) {
                  const insertEditionQuery = `
              INSERT INTO "Editions" ("ItemId", "Edition", "PhysicalArt", "Price", "CurrentOwner", "AuthorId") 
              VALUES ($1, $2, $3, $4, $5, $6);
            `;

                  const insertEditionValues = [
                    ArtInsId, Edition, isPhysicalArt, price, UserId, UserId
                  ];

                  await pool.query(insertEditionQuery, insertEditionValues);
                }


              }

              if (ArtInsId) {
                const updateCollectionQuery = `UPDATE "Collections" SET "ItemCount" = "ItemCount" + 1 WHERE "_id" = $1;
            `;
                const updateCollectionValues = [CollectionId]; await pool.query(updateCollectionQuery, updateCollectionValues);
              }


            }


          }

          const updateResult = await pool.query(`UPDATE "TempCsv" 
           SET "Status" = true WHERE "_id" = $1`, [tempdata._id]);

          if (updateResult.rowCount > 0) {
            const emailContent = invalidItems.length > 0
              ? `The following items have validation issues: ${invalidItems.join(", ")}`
              : "Items Uploaded Via Bulk Mint CSV Upload Processed Successfully";

            const emailData = {
              To: UserInfo.Email,
              Content: emailContent
            };

            const emailEndpoint = invalidItems.length > 0
              ? "/BulkIssueEmail"
              : "/BulkSuccessEmail";

            await Axios.post(Config.Services.EmailService + emailEndpoint, emailData);
          }


        }


      } catch (error) {
        console.log("bulk artwork error", error)
      }
    });

    /* Bulk ArtProduct */

    cron.schedule('*/30 * * * * * ', async () => {
      console.log("Bulk ArtProduct")
      try {

        const query = `SELECT * FROM "TempCsv" WHERE "Type" = 'ArtProduct' AND "Status" = false ORDER BY _id DESC;`;
        const result = await pool.query(query);
        const TempCsvData = result.rows;

        if (TempCsvData.length === 0) {
          console.log("No Data Available for Processing Bulk Update ArtProduct");
          return;
        }

        for (const tempdata of TempCsvData) {

          let CollectionId = tempdata.CollectionId;
          let UserId = tempdata.AuthorId;
          let UserInfo = (await pool.query('SELECT * FROM "Users" WHERE _id = $1 LIMIT 1;', [UserId])).rows[0];
          let CollectionInfo = (await pool.query('SELECT * FROM "Collections" WHERE _id = $1 LIMIT 1;', [CollectionId])).rows[0];
          let Thumb = tempdata.Thumb;
          let Media = tempdata.Media;
          let Type = tempdata.Type;
          const FileUrl = tempdata.FilePath;

          const data = [];


          await Axios.get(FileUrl).then((response) => {

            const csvData = response.data;

            csv().on('data', (row) => {
              console.log("dfd", row);
              data.push(row);
            })
              .on('end', () => {
                console.log(data);
              })
              .write(csvData);
          })
            .catch((error) => {
              console.error('Error downloading or processing the CSV file:', error);
            });


          let latestTokenId = 0;
          const Tresult = await pool.query('SELECT * FROM "ArtItems" WHERE "CollectionId" = $1 ORDER BY "TokenId" DESC LIMIT 1', [CollectionId]);
          const findLatestTokenId = Tresult.rows[0];

          if (findLatestTokenId) {
            latestTokenId = Number(findLatestTokenId.TokenId) + 1;
          }


          let i = 0;
          const invalidItems = [];

          for (const elemnt of data) {

            let FieldValidate = true;

            let ItemName = elemnt.Title;
            let ItemThumb = elemnt.Thumb;
            let ItemMedia = elemnt.Media;


            const imageExtensionsRegex = /\.(jpg|jpeg|png|gif|bmp)$/i;
            const isThumbImage = imageExtensionsRegex.test(ItemThumb);
            const isMediaImage = imageExtensionsRegex.test(ItemMedia);

            if (!isThumbImage || !isMediaImage) {
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            let MatchingThumb = Thumb.find(url => {
              let thumbExtension = url.split('.').pop();
              let thumbFilename = url.split('/').pop().split('-')[0];
              return (
                thumbFilename === ItemThumb ||
                thumbFilename === ItemThumb.replace('.png', '') ||
                thumbFilename === ItemThumb.replace('.jpg', '') ||
                thumbFilename === ItemThumb.replace('.jpeg', '') ||
                thumbFilename === ItemThumb.replace('.jpeg', '.jpg') ||
                thumbFilename === ItemThumb.replace('.jpg', '.jpeg') ||
                (thumbExtension === 'jpg' && (ItemThumb.endsWith('.jpg') || ItemThumb.endsWith('.jpeg')))
              );
            });



            let MatchingMedia = Media.find(url => {
              let mediaExtension = url.split('.').pop();
              let mediaFilename = url.split('/').pop().split('-')[0];
              return (
                mediaFilename === ItemMedia ||
                mediaFilename === ItemMedia.replace('.png', '') ||
                mediaFilename === ItemMedia.replace('.jpg', '') ||
                mediaFilename === ItemMedia.replace('.jpeg', '') ||
                mediaFilename === ItemMedia.replace('.jpeg', '.jpg') ||
                mediaFilename === ItemMedia.replace('.jpg', '.jpeg') ||
                (mediaExtension === 'jpg' && (ItemMedia.endsWith('.jpg') || ItemMedia.endsWith('.jpeg')))
              );
            });

            console.log("AMT", MatchingThumb, "Item", ItemName);
            console.log("AMM", MatchingMedia, "Item", ItemName);

            if (!MatchingThumb || !MatchingMedia) {
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            console.log("1");


            //  const hasAllFields = prequiredFields.every(field => {

            //   const fieldValue = elemnt[field];

            //   if (typeof fieldValue === 'boolean') {
            //     return fieldValue !== undefined;
            //   }

            //   if (typeof fieldValue === 'number') {
            //     return !isNaN(fieldValue);
            //   }

            //   return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
            //  });

            //  const missingFields = prequiredFields.filter(field => !elemnt[field]);

            //  console.log('Missing fields:', missingFields);

            // if (!hasAllFields) {
            //   FieldValidate = false;
            //   invalidItems.push(ItemName);
            //   continue;
            // }






            const Title = (await pool.query('SELECT * FROM "ArtItems" WHERE "Title" = $1 LIMIT 1;', [elemnt.Title])).rows[0];

            if (Title) {
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            const CreationYear = Number(elemnt.CreationYear);
            if (isNaN(CreationYear) || CreationYear < 1000 || CreationYear > 9999) {
              console.log("Invalid Year", elemnt.CreationYear);
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            let ProductBrandValue = null;
            let ProductCategoryValue = null;
            let ProductFabricValue = null;
            let ProductMaterialValue = null;
            let ProductNameValue = null;
            if (elemnt.ProductBrand) {
              const ProductBrand = (await pool.query('SELECT * FROM "ArtProductBrand" WHERE "Title" = $1 LIMIT 1;', [elemnt.ProductBrand])).rows[0];
              if (ProductBrand) {
                ProductBrandValue = ProductBrand._id
              }
              if (!ProductBrand) {
                console.log("Invalid Brand");
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }

            }

            const ProductCategory = (await pool.query('SELECT * FROM "ArtProductCategory" WHERE "Title" = $1 LIMIT 1;', [elemnt.ProductCategory])).rows[0];
            if (ProductCategory) {
              ProductCategoryValue = ProductCategory._id
            }
            if (!ProductCategory) {
              console.log("Invalid Category");
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            if (elemnt.ProductFabric) {
              const ProductFabric = (await pool.query('SELECT * FROM "ArtProductFabric" WHERE "Title" = $1 LIMIT 1;', [elemnt.ProductFabric])).rows[0];
              if (ProductFabric) {
                ProductFabricValue = ProductFabric._id
              }
              if (!ProductFabric) {
                console.log("Invalid Fabric");
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }

            if (elemnt.ProductMaterial) {
              const ProductMaterial = (await pool.query('SELECT * FROM "ArtProductMaterial" WHERE "Title" = $1 LIMIT 1;', [elemnt.ProductMaterial])).rows[0];
              if (ProductMaterial) {
                ProductMaterialValue = ProductMaterial._id
              }
              if (!ProductMaterial) {
                console.log("Invalid Material");
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }

            if (elemnt.ProductName) {
              const ProductName = (await pool.query('SELECT * FROM "ArtProductName" WHERE "Title" = $1 LIMIT 1;', [elemnt.ProductName])).rows[0];
              if (ProductName) {
                ProductNameValue = ProductName._id
              }
              if (!ProductName) {
                console.log("Invalid Name");
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }
            let ProductSizeValue = null;
            if (elemnt.ProductSize) {
              const ProductSize = (await pool.query('SELECT * FROM "ArtProductSize" WHERE "Title" = $1 LIMIT 1;', [elemnt.ProductSize])).rows[0];
              if (ProductSize) {
                ProductSizeValue = ProductSize._id
              }
              if (!ProductSize) {
                console.log("Invalid Size");
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }
            let ProductStyleValue = null
            if (elemnt.ProductStyle) {
              const ProductStyle = (await pool.query('SELECT * FROM "ArtProductStyle" WHERE "Title" = $1 LIMIT 1;', [elemnt.ProductStyle])).rows[0];
              if (ProductStyle) {
                ProductStyleValue = ProductStyle._id
              }
              if (!ProductStyle) {
                console.log("Invalid Style");
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }
            let ProductShapeValue = null;
            if (elemnt.ProductShape) {
              const ProductShape = (await pool.query('SELECT * FROM "ArtProductShape" WHERE "Title" = $1 LIMIT 1;', [elemnt.ProductShape])).rows[0];
              if (ProductShape) {
                ProductShapeValue = ProductShape._id
              }
              if (!ProductShape) {
                console.log("Invalid Shape");
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }
            let ProductTypeValue = null;
            if (elemnt.ProductType) {
              const ProductType = (await pool.query('SELECT * FROM "ArtProductType" WHERE "Title" = $1 LIMIT 1;', [elemnt.ProductType])).rows[0];
              if (ProductType) {
                ProductTypeValue = ProductType._id
              }
              if (!ProductType) {
                console.log("Invalid Type");
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }
            let ProductTechniqueValue = null;
            if (elemnt.ProductTechnique) {
              const ProductTechnique = (await pool.query('SELECT * FROM "ArtProductTechnique" WHERE "Title" = $1 LIMIT 1;', [elemnt.ProductTechnique])).rows[0];
              if (ProductTechnique) {
                ProductTechniqueValue = ProductTechnique._id
              }
              if (!ProductTechnique) {
                console.log("Invalid Technique");
                FieldValidate = false;
                invalidItems.push(ItemName);
                continue;
              }
            }


            if (elemnt.PackageDimension && elemnt.PackageDimension !== "IN" && elemnt.PackageDimension !== "CM") {
              console.log("Invalid Package Dimension");
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            if (elemnt.PackageWeight && elemnt.PackageWeight !== "KG" && elemnt.PackageWeight !== "LB") {
              console.log("Invalid Package Weight");
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            let TokenId;
            if (findLatestTokenId) {
              TokenId = latestTokenId;
              latestTokenId++;
            } else {
              TokenId = i;
              i++;
            }

            let ThumbUpload = await UploadImage(UserInfo, CollectionInfo, ItemName, MatchingThumb, "Thumb");


            let MediaUpload = await UploadImage(UserInfo, CollectionInfo, ItemName, MatchingMedia, "Media");

            if (!ThumbUpload || !MediaUpload) {
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }


            if (!MediaUpload.IPFS) {
              FieldValidate = false;
              invalidItems.push(ItemName);
              continue;
            }

            const Ipfsinfo = await Axios.post(Config.Services.FileService + "IpfsUpload", { 'Data': CollectionInfo.Name });
            const MetaDataIpfs = Ipfsinfo.data.IpfsCID;

            if (MetaDataIpfs) {

              // if (CollectionInfo.IPFSCid && CollectionInfo.IPFSCid !== MetaDataIpfs.cid) {
              //   const IpfsRemove = await Axios.post(Config.Services.FileService + "IpfsUnpin", { 'Data': CollectionInfo.IPFSCid });
              // }
              console.log("Titleimg", MetaDataIpfs);

              await pool.query(`UPDATE "Collections" SET "IPFSCid" = $1, "IPFSHash" = 'https://ipfs.io/ipfs/' || $2          WHERE _id = $3`, [MetaDataIpfs.cid, MetaDataIpfs.cid, CollectionInfo._id]);

            }
            const Edition = parseInt(elemnt.PhysicalEdition) + parseInt(elemnt.DigitalEdition);

            const ArtTitle = (await pool.query('SELECT * FROM "ArtItems" WHERE "Title" = $1 LIMIT 1;', [elemnt.Title])).rows[0];


            let ArtInsId = null;

            if (!ArtTitle) {
              console.log("Thumb upload", ThumbUpload, MediaUpload)
              const insertArtQuery = `
          INSERT INTO "ArtItems" (
            "Title", 
            "CreationYear", 
            "ProductCategory", 
            "Type", 
            "Edition", 
            "PhysicalEdition", 
            "DigitalEdition", 
            "ProductBrand", 
            "ProductFabric", 
            "ProductMaterial", 
            "ProductName", 
            "ProductSize", 
            "ProductShape", 
            "ProductStyle", 
            "ProductTechnique", 
            "ProductType", 
            "PackageHeight", 
            "PackageWidth", 
            "PackageDimension", 
            "PackageWeight", 
            "PackageWeightValue", 
            "Packaging", 
            "PhysicalPrice", 
            "DigitalPrice", 
            "ReceivedPhysicalPrice", 
            "ReceivedDigitalPrice", 
            "PriceTransparency", 
            "PriceDisplay",
            "AutoRejectOffers", 
            "AutoAcceptOffers", 
            "PackageDepth", 
            "Description", 
            "Currency", 
            "ReceiveCurrency", 
            "Unique", 
            "AuthorId", 
            "CollectionId", 
            "Thumb", 
            "Media",  
            "TokenId", 
            "Steps", 
            "IPFSMedia", 
            "IPFSThumb",
            "ThumbOrg",
            "MediaOrg"
          ) 
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 
            $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, 
            $37, $38, $39, $40, $41, $42, $43, $44, $45
          ) 
          RETURNING "_id";
        `;



              const insertArtValues = [
                elemnt.Title,
                CreationYear,
                ProductCategory._id,
                Type,
                Edition,
                elemnt.PhysicalEdition,
                elemnt.DigitalEdition,
                ProductBrandValue,
                ProductFabricValue,
                ProductMaterialValue,
                ProductNameValue,
                ProductSizeValue,
                ProductShapeValue,
                ProductStyleValue,
                ProductTechniqueValue,
                ProductTypeValue,
                elemnt.PackageHeight,
                elemnt.PackageWidth,
                elemnt.PackageDimension,
                elemnt.PackageWeight,
                elemnt.PackageWeightValue,
                elemnt.Packaging,
                0,
                0,
                elemnt.PhysicalPrice,
                elemnt.DigitalPrice,
                elemnt.PriceNegotiation,
                elemnt.PriceDisplay,
                elemnt.AutoRejectOffers,
                elemnt.AutoAcceptOffers,
                elemnt.PackageDepth,
                elemnt.Description,
                CollectionInfo.Currency,
                elemnt.Currency,
                elemnt.Unique,
                UserId,
                CollectionId,
                MatchingThumb,
                MatchingMedia,
                TokenId,
                5,
                MediaUpload.IPFS,
                ThumbUpload.IPFS,
                MatchingThumb,
                MatchingMedia
              ];

              const result = await pool.query(insertArtQuery, insertArtValues);

              ArtInsId = result.rows[0]._id;

              for (let i = 0; i < Edition; i++) {
                let Edition = i + 1;
                let isPhysicalArt = i < elemnt.PhysicalEdition;
                let price = 0;

                const selectEditionQuery = `SELECT COUNT(*) AS count
             FROM "Editions" WHERE "ItemId" = $1 AND "Edition" = $2; `;
                const selectEditionValues = [ArtInsId, Edition];

                const result = await pool.query(selectEditionQuery, selectEditionValues);
                console.log("techh", result.rows[0].count);
                const infoExists = result.rows[0].count > 0;

                if (!infoExists) {
                  const insertEditionQuery = `
               INSERT INTO "Editions" ("ItemId", "Edition", "PhysicalArt", "Price", "CurrentOwner", "AuthorId") 
               VALUES ($1, $2, $3, $4, $5, $6);
             `;

                  const insertEditionValues = [
                    ArtInsId, Edition, isPhysicalArt, price, UserId, UserId
                  ];

                  await pool.query(insertEditionQuery, insertEditionValues);
                }


              }

              if (ArtInsId) {
                const updateCollectionQuery = `UPDATE "Collections" SET "ItemCount" = "ItemCount" + 1 WHERE "_id" = $1;
             `;
                const updateCollectionValues = [CollectionId]; await pool.query(updateCollectionQuery, updateCollectionValues);
              }


            }

          }

          const updateResult = await pool.query(`UPDATE "TempCsv" 
        SET "Status" = true WHERE "_id" = $1`, [tempdata._id]);

          if (updateResult.rowCount > 0) {
            const emailContent = invalidItems.length > 0
              ? `The following items have validation issues: ${invalidItems.join(", ")}`
              : "Items Uploaded Via Bulk Mint CSV Upload Processed Successfully";

            const emailData = {
              To: UserInfo.Email,
              Content: emailContent
            };

            const emailEndpoint = invalidItems.length > 0
              ? "/BulkIssueEmail"
              : "/BulkSuccessEmail";

            await Axios.post(Config.Services.EmailService + emailEndpoint, emailData);
          }

        }


      } catch (error) {

      }
    });

    /* Remove Item From Cart Once 48 hours Reached */

    cron.schedule('0 0 * * *', async () => {
      try {
        // Calculate the timestamp for the threshold (48 hours ago)
        const deleteThreshold = new Date();
        deleteThreshold.setHours(deleteThreshold.getHours() - 48);

        const deleteQuery = `
        WITH deleting_products AS (
          SELECT "ItemId", "Edition"
          FROM "Cart"
          WHERE "createdAt" < $1
        )
        DELETE FROM "Offers" o
        WHERE (o."ItemId", o."Edition") IN (SELECT "ItemId", "Edition" FROM deleting_products);
  
        DELETE FROM "PreOffers" po
        WHERE (po."ItemId", po."Edition") IN (SELECT "ItemId", "Edition" FROM deleting_products);
  
        DELETE FROM "Cart"
        WHERE "createdAt" < $1
        RETURNING "deletedCount";
      `;

        const deleteParams = [deleteThreshold];

        const result = await pool.query(deleteQuery, deleteParams);
        const deletedCount = result.rows[0].deletedCount;

        console.log(`${deletedCount} products deleted.`);
      } catch (error) {
        console.error('Error deleting products:', error);
      }
    });

    /* To Send Registered User Count Values in Email to Admin */

    cron.schedule('0 0 * * *', async () => {
      try {

        let AdminInfo = (await pool.query('SELECT * FROM "Admin" WHERE "Role" = $1 AND "Status" = $2 LIMIT 1;', ['SuperAdmin', 'Active'])).rows[0];

        const Email = AdminInfo.Email;

        const query = `SELECT COUNT(*) as today_users_count FROM "Users" WHERE "Steps" = $1 AND "AccountStatus" = $2;`;
        const values = [5, 0];

        const result = await pool.query(query, values);
        const todayUsersCount = result.rows[0].today_users_count;


        if (todayUsersCount > 0) {
          await Axios.post(Config.Services.EmailService + "/RegisterAdminNotifyEmail", {
            To: Email,
            Count: todayUsersCount
          });
        }


      } catch (error) {
        console.error('Error sending registartion approval alert email:', error);
      }
    });

    /* To Send Emails When Offer Range End */

    cron.schedule('0 0 * * *', async () => {
      try {
        const editionQuery = `
        SELECT e.*, a."Title", u."Email"
        FROM "Editions" e
        JOIN "ArtItems" a ON e."ItemId" = a."_id"
        JOIN "Users" u ON e."CurrentOwner" = u."_id"
        WHERE e."EndDateTimeUtc" <= NOW() 
          AND e."EnableAuction" = true 
          AND e."EmailSent" IS NOT TRUE;
      `;

        const result = await pool.query(editionQuery);

        for (const row of result.rows) {
          const UserInfo = row;

          await Axios.post(Config.Services.EmailService + "/OfferExpiredEmail", {
            To: UserInfo.Email,
            ItemName: UserInfo.Title
          });

          const updateEmailSentQuery = `
          UPDATE "Editions" 
          SET "EmailSent" = true
          WHERE "_id" = $1;
        `;

          await pool.query(updateEmailSentQuery, [UserInfo._id]);
        }
      } catch (error) {
        console.error('Error:', error);
      }
    });

    cron.schedule('*/1 * * * *', async () => {
      try {

        //console.log("ipfs check satrt");

        let ItemInfo = await pool.query(`SELECT * FROM "ArtItems" WHERE "PublishStatus" = true AND "IPFSStatus" = false`);
        ItemInfo = ItemInfo.rows;

        for (const item of ItemInfo) {

          if (item.TokenId) {

            const collectionQuery = 'SELECT * FROM "Collections" WHERE "_id" = $1';
            const collectionValues = [item.CollectionId];
            const collectionResult = await pool.query(collectionQuery, collectionValues);
            const collectionInfo = collectionResult.rows[0];

            const Ipfsinfo = await Axios.post(Config.Services.FileService + "IpfsCID", { 'Data': collectionInfo.Name });
            const resp = Ipfsinfo.data.IpfsCID;

            const ipfsUploadInfo = await Axios.post(Config.Services.FileService + "IpfsUpload", { 'Data': collectionInfo.Name });
            const MetaDataIpfs = ipfsUploadInfo.data.IpfsCID;

            if (MetaDataIpfs) {
              if (collectionInfo.IPFSCid && collectionInfo.IPFSCid !== MetaDataIpfs.cid) {
                await Axios.post(Config.Services.FileService + "IpfsUnpin", { 'Data': collectionInfo.IPFSCid });
              }
              const updateCollectionQuery = `
                    UPDATE "Collections"
                    SET "IPFSCid" = $1, "IPFSHash" = $2
                    WHERE "_id" = $3
                  `;
              const updateCollectionValues = [
                MetaDataIpfs.cid,
                `https://ipfs.io/ipfs/${MetaDataIpfs.cid}`,
                collectionInfo._id
              ];
              await pool.query(updateCollectionQuery, updateCollectionValues);
              const query = 'UPDATE "ArtItems" SET "IPFSStatus" = $1 WHERE _id = $2';
              const values = [true, ItemInfo._id];

              await pool.query(query, values);

              console.log("ipfscheck pass");


            } else {

              console.log("ipfscheck fail");
            }


          }
        }

      } catch (error) {
        console.error('Error ipfs status check', error);

      }
    });

    cron.schedule('* * * * *', async () => {
      try {

        const ArtItem = await pool.query('SELECT * FROM "ArtItems" WHERE "Steps" >= $1 ORDER BY "_id" DESC', [3]).then(result => result.rows);

        if (ArtItem.length === 0) {
          console.log("No Data Available for Processing");
          return;
        }
        const [responsematic, responseeth] = await Promise.all([
          Axios.get("https://api.coingecko.com/api/v3/simple/price", { params: { ids: "matic-network", vs_currencies: "eur,gbp,usd,sgd" } }),
          Axios.get("https://api.coingecko.com/api/v3/simple/price", { params: { ids: "ethereum", vs_currencies: "eur,gbp,usd,sgd" } })
        ]);

        for (const CurInfo of ArtItem) {

          const Artworkid = CurInfo._id;

          let CPhysicalPrice = CurInfo.ReceivedPhysicalPrice || CurInfo.PhysicalPrice;
          let CDigitalPrice = CurInfo.ReceivedDigitalPrice || CurInfo.DigitalPrice;


          const isETHorMATIC = CurInfo.ReceiveCurrency === "ETH" || CurInfo.ReceiveCurrency === "MATIC";
          const currencyId = CurInfo.Currency === "MATIC" ? "matic-network" : "ethereum";

          let Upd_Data = "";


          if (!isETHorMATIC && CurInfo.ReceiveCurrency) {

            const response = currencyId === "matic-network" ? responsematic : responseeth;
            const ethereumPrice = response.data[currencyId];

            CPhysicalPrice = parseFloat(CurInfo.ReceivedPhysicalPrice) / parseFloat(ethereumPrice[CurInfo.ReceiveCurrency.toLowerCase()]);

            CDigitalPrice = parseFloat(CurInfo.ReceivedDigitalPrice) / parseFloat(ethereumPrice[CurInfo.ReceiveCurrency.toLowerCase()]);

            Upd_Data = {
              PhysicalPrice: CPhysicalPrice,
              DigitalPrice: CDigitalPrice,
              PhysicalGBPPrice: CPhysicalPrice * ethereumPrice.gbp,
              PhysicalUSDPrice: CPhysicalPrice * ethereumPrice.usd,
              PhysicalEURPrice: CPhysicalPrice * ethereumPrice.eur,
              PhysicalSGDPrice: CPhysicalPrice * ethereumPrice.sgd,
              DigitalGBPPrice: CDigitalPrice * ethereumPrice.gbp,
              DigitalUSDPrice: CDigitalPrice * ethereumPrice.usd,
              DigitalEURPrice: CDigitalPrice * ethereumPrice.eur,
              DigitalSGDPrice: CDigitalPrice * ethereumPrice.sgd,

            };
          } else {

            const response = currencyId === "matic-network" ? responsematic : responseeth;
            const ethereumPrice = response.data[currencyId];

            Upd_Data = {
              PhysicalPrice: CPhysicalPrice,
              DigitalPrice: CDigitalPrice,
              PhysicalGBPPrice: CPhysicalPrice * ethereumPrice.gbp,
              PhysicalUSDPrice: CPhysicalPrice * ethereumPrice.usd,
              PhysicalEURPrice: CPhysicalPrice * ethereumPrice.eur,
              PhysicalSGDPrice: CPhysicalPrice * ethereumPrice.sgd,
              DigitalGBPPrice: CDigitalPrice * ethereumPrice.gbp,
              DigitalUSDPrice: CDigitalPrice * ethereumPrice.usd,
              DigitalEURPrice: CDigitalPrice * ethereumPrice.eur,
              DigitalSGDPrice: CDigitalPrice * ethereumPrice.sgd,
            };
          }

          const updateQuery = `
          UPDATE "ArtItems"
          SET "PhysicalPrice" = $1,
              "DigitalPrice" = $2,
              "PhysicalGBPPrice" = $3,
              "PhysicalUSDPrice" = $4,
              "PhysicalEURPrice" = $5,
              "PhysicalSGDPrice" = $6,
              "DigitalGBPPrice" = $7,
              "DigitalUSDPrice" = $8,
              "DigitalEURPrice" = $9,
              "DigitalSGDPrice" = $10
          WHERE "_id" = $11;
        `;

          const updateValues = [
            Upd_Data.PhysicalPrice,
            Upd_Data.DigitalPrice,
            Upd_Data.PhysicalGBPPrice,
            Upd_Data.PhysicalUSDPrice,
            Upd_Data.PhysicalEURPrice,
            Upd_Data.PhysicalSGDPrice,
            Upd_Data.DigitalGBPPrice,
            Upd_Data.DigitalUSDPrice,
            Upd_Data.DigitalEURPrice,
            Upd_Data.DigitalSGDPrice,
            Artworkid
          ];

          await pool.query(updateQuery, updateValues);

          const editionInfoResult = await pool.query('SELECT * FROM "Editions" WHERE "ItemId" = $1', [Artworkid]);
          const Editioninfo = editionInfoResult.rows[0];

          const itemInfoResult = await pool.query('SELECT * FROM "ArtItems" WHERE "_id" = $1', [Artworkid]);
          const ItemInfo = itemInfoResult.rows[0];

          if (Editioninfo) {
            const updateEditionPricesQuery = `
            UPDATE "Editions"
            SET "Price" = CASE
              WHEN "PhysicalArt" = true THEN $1
              WHEN "PhysicalArt" = false THEN $2
              ELSE "Price"
            END
            WHERE "ItemId" = $3;
          `;

            const updateEditionPricesValues = [ItemInfo.PhysicalPrice, ItemInfo.DigitalPrice, Artworkid];

            await pool.query(updateEditionPricesQuery, updateEditionPricesValues);

          }
        }
        console.log("End")
      } catch (error) {
        console.error('Error uploading files', error);
      }
    });

    // Define the list of RPC endpoints here
    const rpcEndpoints = Config.polygonRPCEndpoints;

    let currentRpcIndex = 0; // Keep track of the current RPC endpoint index

    cron.schedule('*/20 * * * * *', async () => {
      try {
        // Find the network record for the currency "MATIC"

        let network = await pool.query(`SELECT * FROM "Networks" WHERE "Currency" = 'MATIC'`);
        network = network.rows[0];

        if (!network) {
          console.log("Network not found");
          return;
        }

        // Create a new Web3 instance with the current RPC endpoint
        //console.log("network", network.RpcUrl)
        const web3 = new Web3(new Web3.providers.HttpProvider(network.RpcUrl));
        // Check the status of the current RPC endpoint by making a simple request
        // For example, you can use the web3.eth.getBlockNumber() function
        const blockNumber = await web3.eth.getBlockNumber();
        //console.log("blockNumber", blockNumber, network.RpcUrl)
        if (!blockNumber) {
          console.log("currentRpcIndex", currentRpcIndex)
          // If the RPC endpoint is down, switch to the next stable RPC endpoint in the list
          currentRpcIndex = (currentRpcIndex + 1) % rpcEndpoints.length;
          const stableRpcUrl = rpcEndpoints[currentRpcIndex];

          // Update the database with the stable RPC endpoint

          const query = `UPDATE "Networks" SET "RpcUrl" = $1 WHERE "Currency" = $2`;

          const values = [stableRpcUrl, "MATIC"];

          try {
            await pool.query(query, values);
            //console.log("Update successful");
          } catch (error) {
            console.error("Error updating Networks:", error);
          }

        }

        //console.log("End");
      } catch (error) {
        console.error('Error uploading files', error);
        console.log("currentRpcIndex", currentRpcIndex)
        // If the RPC endpoint is down, switch to the next stable RPC endpoint in the list
        currentRpcIndex = (currentRpcIndex + 1) % rpcEndpoints.length;
        const stableRpcUrl = rpcEndpoints[currentRpcIndex];
        console.log("stableRpcUrl", stableRpcUrl)
        // Update the database with the stable RPC endpoint
        const query = `UPDATE "Networks" SET "RpcUrl" = $1 WHERE "Currency" = $2`;

        const values = [stableRpcUrl, "MATIC"];

        try {
          await pool.query(query, values);
          //console.log("Update successful");
        } catch (error) {
          console.error("Error updating Networks:", error);
        }
      }
    });

    // Define the list of RPC endpoints here
    const rpcEndpointsETH = Config.ETHRPCEndpoints;

    let currentRpcIndexETH = 0; // Keep track of the current RPC endpoint index

    cron.schedule('*/20 * * * * *', async () => {
      try {
        // Find the network record for the currency "MATIC"
        let network = await pool.query(`SELECT * FROM "Networks" WHERE "Currency" = 'ETH'`);
        network = network.rows[0];

        if (!network) {
          console.log("Network not found");
          return;
        }

        // Create a new Web3 instance with the current RPC endpoint
        //console.log("network", network.RpcUrl)
        const web3 = new Web3(new Web3.providers.HttpProvider(network.RpcUrl));
        // Check the status of the current RPC endpoint by making a simple request
        // For example, you can use the web3.eth.getBlockNumber() function
        const blockNumber = await web3.eth.getBlockNumber();
        //console.log("blockNumber", blockNumber, network.RpcUrl)
        if (!blockNumber) {
          console.log("currentRpcIndex", currentRpcIndexETH)
          // If the RPC endpoint is down, switch to the next stable RPC endpoint in the list
          currentRpcIndexETH = (currentRpcIndexETH + 1) % rpcEndpointsETH.length;
          const stableRpcUrl = rpcEndpointsETH[currentRpcIndexETH];

          // Update the database with the stable RPC endpoint
          const query = `UPDATE "Networks" SET "RpcUrl" = $1 WHERE "Currency" = $2`;

          const values = [stableRpcUrl, "ETH"];

          try {
            await pool.query(query, values);
            //console.log("Update successful");
          } catch (error) {
            console.error("Error updating Networks:", error);
          }
        }

        //console.log("End");
      } catch (error) {
        console.error('Error uploading files', error);
        console.log("currentRpcIndexETH", currentRpcIndexETH)
        // If the RPC endpoint is down, switch to the next stable RPC endpoint in the list
        currentRpcIndexETH = (currentRpcIndexETH + 1) % rpcEndpointsETH.length;
        const stableRpcUrl = rpcEndpointsETH[currentRpcIndexETH];
        console.log("stableRpcUrl", stableRpcUrl)
        // Update the database with the stable RPC endpoint
        const query = `UPDATE "Networks" SET "RpcUrl" = $1 WHERE "Currency" = $2`;

        const values = [stableRpcUrl, "MATIC"];

        try {
          await pool.query(query, values);
          //console.log("Update successful");
        } catch (error) {
          console.error("Error updating Networks:", error);
        }
      }
    });

  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}


// Define a GET route '/'
fastify.get('/', (request, reply) => {
  const message = '<strong>Fastify Running !!! </strong>'
  reply.type('text/html').send(message)
})

// Start the server
start()

// Export the Fastify instance
module.exports = fastify;
