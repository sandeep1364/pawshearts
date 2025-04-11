const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Blog = require('../models/Blog');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image.'), false);
    }
  }
});

// @route   GET /api/blogs
// @desc    Get all blogs
// @access  Public
router.get('/', async (req, res) => {
  try {
    const blogs = await Blog.find()
      .populate('author', 'name email businessName')
      .sort('-createdAt');
    res.json(blogs);
  } catch (err) {
    console.error('Error fetching blogs:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/blogs/:id
// @desc    Get blog by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate('author', 'name email businessName');
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    res.json(blog);
  } catch (err) {
    console.error('Error fetching blog:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/blogs
// @desc    Create a blog
// @access  Private
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, content, tags } = req.body;
    
    const blog = new Blog({
      title,
      content,
      author: req.user._id,
      image: req.file ? req.file.filename : null,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : []
    });

    await blog.save();
    
    const populatedBlog = await Blog.findById(blog._id)
      .populate('author', 'name email businessName');

    res.status(201).json(populatedBlog);
  } catch (err) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Error creating blog:', err);
    res.status(400).json({ message: err.message });
  }
});

// @route   PUT /api/blogs/:id
// @desc    Update a blog
// @access  Private
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ message: 'Blog not found' });
    }

    if (blog.author.toString() !== req.user._id.toString()) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({ message: 'Not authorized to update this blog' });
    }

    const { title, content } = req.body;
    
    // If there's a new image, delete the old one
    if (req.file && blog.image) {
      const oldImagePath = path.join('uploads', blog.image);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    blog.title = title;
    blog.content = content;
    if (req.file) {
      blog.image = req.file.filename;
    }

    await blog.save();
    
    const updatedBlog = await Blog.findById(blog._id)
      .populate('author', 'name email businessName');

    res.json(updatedBlog);
  } catch (err) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Error updating blog:', err);
    res.status(400).json({ message: err.message });
  }
});

// @route   DELETE /api/blogs/:id
// @desc    Delete a blog
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    if (blog.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this blog' });
    }

    // Delete the blog image if it exists
    if (blog.image) {
      const imagePath = path.join('uploads', blog.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await blog.remove();
    res.json({ message: 'Blog deleted successfully' });
  } catch (err) {
    console.error('Error deleting blog:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/blogs/:id/like
// @desc    Like/Unlike a blog
// @access  Private
router.post('/:id/like', auth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    // Check if already liked
    const likeIndex = blog.likes.indexOf(req.user.id);
    
    if (likeIndex > -1) {
      // Unlike
      blog.likes.splice(likeIndex, 1);
    } else {
      // Like
      blog.likes.push(req.user.id);
    }

    await blog.save();
    res.json(blog.likes);
  } catch (err) {
    console.error('Error liking blog:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/blogs/:id/comments
// @desc    Add a comment to a blog
// @access  Private
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    const newComment = {
      content: req.body.content,
      author: req.user.id
    };

    blog.comments.unshift(newComment);
    await blog.save();
    
    await blog.populate('comments.author', 'name avatar');
    
    res.json(blog.comments);
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/blogs/user/me
// @desc    Get blogs by current user
// @access  Private
router.get('/user/me', auth, async (req, res) => {
  try {
    const blogs = await Blog.find({ author: req.user._id })
      .populate('author', 'name email businessName')
      .sort('-createdAt');
    res.json(blogs);
  } catch (err) {
    console.error('Error fetching user blogs:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 