const Community = require('../models/Community');
const Message = require('../models/Message');
const User = require('../models/User');

const communityController = {
  // Create a new community
  createCommunity: async (req, res) => {
    try {
      const { name, description } = req.body;
      
      const community = new Community({
        name,
        description,
        createdBy: req.user._id,
        members: [req.user._id],
        image: req.file ? req.file.filename : null
      });

      await community.save();
      
      const populatedCommunity = await Community.findById(community._id)
        .populate('createdBy', 'name profilePicture')
        .populate('members', 'name profilePicture');

      res.status(201).json(populatedCommunity);
    } catch (error) {
      console.error('Error creating community:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get all communities
  getAllCommunities: async (req, res) => {
    try {
      const communities = await Community.find()
        .populate('createdBy', 'name profilePicture')
        .populate('members', 'name profilePicture')
        .sort('-createdAt');
      res.json(communities);
    } catch (error) {
      console.error('Error fetching communities:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Join a community
  joinCommunity: async (req, res) => {
    try {
      const community = await Community.findById(req.params.id);
      
      if (!community) {
        return res.status(404).json({ message: 'Community not found' });
      }

      if (community.members.includes(req.user._id)) {
        return res.status(400).json({ message: 'Already a member of this community' });
      }

      community.members.push(req.user._id);
      await community.save();

      const populatedCommunity = await Community.findById(community._id)
        .populate('createdBy', 'name profilePicture')
        .populate('members', 'name profilePicture');

      res.json(populatedCommunity);
    } catch (error) {
      console.error('Error joining community:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Leave a community
  leaveCommunity: async (req, res) => {
    try {
      const community = await Community.findById(req.params.id);
      
      if (!community) {
        return res.status(404).json({ message: 'Community not found' });
      }

      if (!community.members.includes(req.user._id)) {
        return res.status(400).json({ message: 'Not a member of this community' });
      }

      if (community.createdBy.toString() === req.user._id.toString()) {
        return res.status(400).json({ message: 'Community creator cannot leave the community' });
      }

      community.members = community.members.filter(
        member => member.toString() !== req.user._id.toString()
      );
      await community.save();

      const populatedCommunity = await Community.findById(community._id)
        .populate('createdBy', 'name profilePicture')
        .populate('members', 'name profilePicture');

      res.json(populatedCommunity);
    } catch (error) {
      console.error('Error leaving community:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get messages for a community
  getMessages: async (req, res) => {
    try {
      const messages = await Message.find({ community: req.params.id })
        .populate('sender', 'name profilePicture')
        .sort('createdAt');
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Send a message to a community
  sendMessage: async (req, res) => {
    try {
      const { content } = req.body;
      const community = await Community.findById(req.params.id);
      
      if (!community) {
        return res.status(404).json({ message: 'Community not found' });
      }

      if (!community.members.includes(req.user._id)) {
        return res.status(400).json({ message: 'Must be a member to send messages' });
      }

      const message = new Message({
        content,
        sender: req.user._id,
        community: req.params.id,
        image: req.file ? req.file.filename : null
      });

      await message.save();

      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'name profilePicture');

      res.status(201).json(populatedMessage);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ message: error.message });
    }
  }
};

module.exports = communityController; 