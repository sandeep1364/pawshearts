const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Blog = require('../models/Blog');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5000000 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// @route   GET /api/blogs
// @desc    Get all blogs
// @access  Public
router.get('/', async (req, res) => {
  try {
    const blogs = await Blog.find()
      .sort({ createdAt: -1 })
      .populate('author', 'name avatar')
      .populate('comments.author', 'name avatar');
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
      .populate('author', 'name avatar')
      .populate('comments.author', 'name avatar');
    
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
router.post('/', auth, upload.single('featuredImage'), async (req, res) => {
  try {
    const { title, subtitle, content, tags } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Featured image is required' });
    }

    if (!req.user || !req.user.id) {
      console.error('User not found in request:', req.user);
      return res.status(401).json({ message: 'User not authenticated' });
    }

    console.log('Creating blog with user ID:', req.user.id);

    const newBlog = new Blog({
      title,
      subtitle,
      content,
      tags: JSON.parse(tags),
      featuredImage: '/uploads/' + req.file.filename,
      author: req.user.id,
      readTime: Math.ceil(content.split(' ').length / 200) // Assuming average reading speed of 200 words per minute
    });

    const blog = await newBlog.save();
    await blog.populate('author', 'name avatar');
    
    console.log('Blog created successfully:', blog._id);
    res.json(blog);
  } catch (err) {
    console.error('Error creating blog:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation Error',
        details: Object.values(err.errors).map(error => error.message)
      });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/blogs/:id
// @desc    Update a blog
// @access  Private
router.put('/:id', auth, upload.single('featuredImage'), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    
    if (blog.author.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    const updateData = {
      title: req.body.title || blog.title,
      subtitle: req.body.subtitle || blog.subtitle,
      content: req.body.content || blog.content,
      tags: req.body.tags ? JSON.parse(req.body.tags) : blog.tags
    };

    if (req.file) {
      updateData.featuredImage = '/uploads/' + req.file.filename;
    }

    if (updateData.content !== blog.content) {
      updateData.readTime = Math.ceil(updateData.content.split(' ').length / 200);
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    ).populate('author', 'name avatar');

    res.json(updatedBlog);
  } catch (err) {
    console.error('Error updating blog:', err);
    res.status(500).json({ message: 'Server error' });
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
    
    if (blog.author.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    await blog.remove();
    res.json({ message: 'Blog removed' });
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

module.exports = router; 