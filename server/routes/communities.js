const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/communities');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Community routes
router.post('/', auth, upload.single('image'), communityController.createCommunity);
router.get('/', auth, communityController.getAllCommunities);
router.post('/:id/join', auth, communityController.joinCommunity);
router.post('/:id/leave', auth, communityController.leaveCommunity);

// Message routes
router.get('/:id/messages', auth, communityController.getMessages);
router.post('/:id/messages', auth, upload.single('image'), communityController.sendMessage);

module.exports = router; 