const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Get all posts
router.get('/', auth, async (req, res) => {
  try {
    console.log('Fetching posts...');
    const posts = await Post.find()
      .populate('author', 'name profilePicture')
      .populate('comments.author', 'name profilePicture')
      .sort({ createdAt: -1 });
    console.log('Posts fetched successfully:', posts.length);
    res.json(posts);
  } catch (err) {
    console.error('Error fetching posts:', err);
    res.status(500).json({ message: 'Error fetching posts', error: err.message });
  }
});

// Create a new post
router.post('/', auth, upload.array('images', 5), async (req, res) => {
  try {
    console.log('Creating new post:', req.body);
    const { title, content, tags } = req.body;
    
    // Process uploaded images
    const images = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
    
    // Parse tags if they're sent as a string
    const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags || [];

    const post = new Post({
      title,
      content,
      tags: parsedTags,
      images,
      author: req.user.id
    });

    const newPost = await post.save();
    await newPost.populate('author', 'name profilePicture');
    console.log('Post created successfully:', newPost._id);
    res.status(201).json(newPost);
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(400).json({ message: 'Error creating post', error: err.message });
  }
});

// Like a post
router.post('/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const likeIndex = post.likes.indexOf(req.user.id);
    if (likeIndex === -1) {
      post.likes.push(req.user.id);
    } else {
      post.likes.splice(likeIndex, 1);
    }

    await post.save();
    await post.populate('author', 'name profilePicture');
    res.json(post);
  } catch (err) {
    console.error('Error liking post:', err);
    res.status(500).json({ message: 'Error processing like', error: err.message });
  }
});

// Add a comment to a post
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    post.comments.push({
      content,
      author: req.user.id
    });

    await post.save();
    await post.populate('author', 'name profilePicture')
      .populate('comments.author', 'name profilePicture');
    res.json(post);
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({ message: 'Error adding comment', error: err.message });
  }
});

// Delete a post
router.delete('/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.author.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }

    await post.deleteOne();
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).json({ message: 'Error deleting post', error: err.message });
  }
});

module.exports = router; 