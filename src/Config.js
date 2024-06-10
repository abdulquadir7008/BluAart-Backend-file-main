require('dotenv').config({ path: require('find-config')('.env') })
module.exports = {
    server:{
        port: process.env.PORT
    },
    Services: {
        FileService: process.env.FILE_SERVICE,
        EmailService: process.env.EMAIL_SERVICE
    },
    Pinata:{
        Key: process.env.PinataKey,
        Secret: process.env.PinataSecret,
        Jwt: process.env.PinataJwt
    },
    S3:{
        AccessKey: process.env.S3AccessKey,
        SecretKey: process.env.S3SecretKey,
        Bucket: process.env.S3Bucket,
        Region: process.env.S3Region
    },
    sqldb:{
        user: process.env.DUSERNAME,
        host: process.env.HOST,
        database: process.env.DBNAME,
        password: process.env.PASSWORD,
        port: process.env._PORT,
        sslmode: process.env.SSLMODE,
        ssl:{
            rejectUnauthorized:false,
        }
    },
    polygonRPCEndpoints: [
        "https://rpc-mumbai.maticvigil.com",
        "https://rpc.ankr.com/polygon_mumbai",
        "https://polygon-mumbai.blockpi.network/v1/rpc/public",
        "https://endpoints.omniatech.io/v1/matic/mumbai/public",
        "https://polygon-mumbai-bor.publicnode.com",
        "https://polygon-testnet.public.blastapi.io",
        "https://polygon-rpc.com",
        "https://polygon-mumbai.g.alchemy.com/v2/demo",
        "https://polygon-mumbai.blockpi.network/v/rpc/public",
        "https://api.zan.top/node/v1/polygon/mumbai/public",
        "https://polygon-mumbai.gateway.tenderly.co",
        "https://gateway.tenderly.co/public/polygon-mumbai",
        "https://matic-testnet-archive-rpc.bwarelabs.com",
        "https://matic-mumbai.chainstacklabs.com",
        "https://polygontestapi.terminet.io/rpc"
      ],
      ETHRPCEndpoints: [
        "https://sepolia.infura.io/v3/dae611ce7d8b46c088b9f07416f97dfc",
        "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
        "https://api.zan.top/node/v1/eth/sepolia/public",
        "https://eth-sepolia.public.blastapi.io",
        "https://sepolia.gateway.tenderly.co",
        "https://gateway.tenderly.co/public/sepolia",
        "https://eth-sepolia-public.unifra.io",
        "https://rpc.notadegen.com/sepolia",
        "https://endpoints.omniatech.io/v1/eth/sepolia/public",
        "https://eth-sepolia.g.alchemy.com/v2/demo",
        "https://rpc2.sepolia.org",
        "https://rpc.sepolia.org",
        "https://rpc.sepolia.ethpandaops.io",
        "https://rpc-sepolia.rockx.com",
        "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
        "https://rpc2.sepolia.org"
      ]
  
    
}