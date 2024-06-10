const UserController = require('../controllers/UserController');



function UserRoutes(fastify, options, done) {

   
    fastify.post('/S3Upload', { preHandler: [UserController.SingleImageUpdate], handler:UserController.S3ImageUploader});

    fastify.post('/BulkS3Upload', { preHandler: [UserController.BulkImageUpdate], handler:UserController.S3ImageUploader});

    fastify.post('/MetaJson', { handler:UserController.MetaJsonUpdate});

    fastify.post('/ImageUrlUpload', { handler:UserController.SingleImageUploaderForBulk});

    fastify.post('/ImageUrlIPFSUpload', { handler:UserController.IPFSUploaderForBulk});


    fastify.post('/GiftMetaJson', { handler:UserController.GiftMetaJsonUpdate});
    fastify.post('/IpfsCID', { handler:UserController.IpfsCIDUpdate});
    fastify.post('/GiftIpfsCID', { handler:UserController.GiftIpfsCIDUpdate});
    fastify.post('/IpfsUpload', { handler:UserController.IpfsUploadUpdate});
    fastify.post('/IpfsUnpin', { handler:UserController.IpfsUnpinUpdate});
    done()
}

module.exports = UserRoutes;