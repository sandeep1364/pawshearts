const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');
const AdoptionRequest = require('../models/AdoptionRequest');
const Pet = require('../models/Pet');
const mongoose = require('mongoose');

// Get chat for an adoption request
router.get('/adoption/:adoptionRequestId', auth, async (req, res) => {
  try {
    console.log('Getting chat for adoption request:', req.params.adoptionRequestId);
    console.log('User:', req.user._id);

    // Validate adoptionRequestId
    if (!mongoose.Types.ObjectId.isValid(req.params.adoptionRequestId)) {
      console.error('Invalid adoption request ID format');
      return res.status(400).json({ message: 'Invalid adoption request ID' });
    }

    // First check if the adoption request exists and if the user is authorized
    const adoptionRequest = await AdoptionRequest.findById(req.params.adoptionRequestId);
    if (!adoptionRequest) {
      console.error('Adoption request not found');
      return res.status(404).json({ message: 'Adoption request not found' });
    }

    // Check if user is either the buyer or seller
    if (adoptionRequest.userId.toString() !== req.user._id.toString() && 
        adoptionRequest.sellerId.toString() !== req.user._id.toString()) {
      console.error('User not authorized to view this chat');
      return res.status(403).json({ message: 'Not authorized to view this chat' });
    }

    const chat = await Chat.findOne({ adoptionRequest: req.params.adoptionRequestId })
      .populate('messages.sender', 'name avatar')
      .populate('buyer', 'name avatar')
      .populate('seller', 'name avatar businessName');
    
    if (!chat) {
      console.log('Chat not found for adoption request');
      return res.status(404).json({ message: 'Chat not found' });
    }

    console.log('Chat found:', chat._id);
    res.json(chat);
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new chat for an adoption request
router.post('/adoption/:adoptionRequestId', auth, async (req, res) => {
  try {
    console.log('Creating chat for adoption request:', req.params.adoptionRequestId);
    console.log('User:', req.user._id);

    // Validate adoptionRequestId
    if (!mongoose.Types.ObjectId.isValid(req.params.adoptionRequestId)) {
      console.error('Invalid adoption request ID format');
      return res.status(400).json({ message: 'Invalid adoption request ID' });
    }

    // Check if chat already exists
    const existingChat = await Chat.findOne({ adoptionRequest: req.params.adoptionRequestId });
    if (existingChat) {
      console.log('Chat already exists:', existingChat._id);
      return res.status(400).json({ message: 'Chat already exists for this adoption request' });
    }

    // Get adoption request details
    const adoptionRequest = await AdoptionRequest.findById(req.params.adoptionRequestId);
    if (!adoptionRequest) {
      console.error('Adoption request not found');
      return res.status(404).json({ message: 'Adoption request not found' });
    }

    // Check if user is either the buyer or seller
    if (adoptionRequest.userId.toString() !== req.user._id.toString() && 
        adoptionRequest.sellerId.toString() !== req.user._id.toString()) {
      console.error('User not authorized to create this chat');
      return res.status(403).json({ message: 'Not authorized to create this chat' });
    }

    // Create new chat
    const chat = new Chat({
      adoptionRequest: adoptionRequest._id,
      buyer: adoptionRequest.userId,
      seller: adoptionRequest.sellerId,
      messages: []
    });

    await chat.save();
    console.log('New chat created:', chat._id);

    // Populate user details
    await chat.populate('buyer', 'name avatar');
    await chat.populate('seller', 'name avatar businessName');
    await chat.populate('messages.sender', 'name avatar');

    res.status(201).json(chat);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send a message in a chat
router.post('/:chatId/messages', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    // Validate chatId
    if (!mongoose.Types.ObjectId.isValid(req.params.chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Verify user is part of this chat
    if (chat.buyer.toString() !== req.user._id.toString() && 
        chat.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to send messages in this chat' });
    }

    // Add message
    chat.messages.push({
      sender: req.user._id,
      content
    });

    await chat.save();

    // Populate sender details for the new message
    const populatedChat = await Chat.findById(chat._id)
      .populate('messages.sender', 'name avatar')
      .populate('buyer', 'name avatar')
      .populate('seller', 'name avatar businessName');

    res.json(populatedChat);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Accept terms (both parties must accept for adoption to proceed)
router.post('/:chatId/accept', auth, async (req, res) => {
  try {
    // Validate chatId
    if (!mongoose.Types.ObjectId.isValid(req.params.chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Determine if user is buyer or seller
    const isBuyer = chat.buyer.toString() === req.user._id.toString();
    const isSeller = chat.seller.toString() === req.user._id.toString();

    if (!isBuyer && !isSeller) {
      return res.status(403).json({ message: 'Not authorized to accept terms for this chat' });
    }

    // Update acceptance status
    if (isBuyer) {
      chat.buyerAccepted = true;
    } else {
      chat.sellerAccepted = true;
    }

    await chat.save();

    // If both parties have accepted, approve the adoption
    if (chat.buyerAccepted && chat.sellerAccepted) {
      const adoptionRequest = await AdoptionRequest.findById(chat.adoptionRequest);
      if (adoptionRequest) {
        adoptionRequest.status = 'approved';
        await adoptionRequest.save();

        // Update pet status
        const pet = await Pet.findById(adoptionRequest.petId);
        if (pet) {
          pet.status = 'adopted';
          pet.adopter = chat.buyer;
          await pet.save();
        }
      }
    }

    // Populate and return updated chat
    const populatedChat = await Chat.findById(chat._id)
      .populate('messages.sender', 'name avatar')
      .populate('buyer', 'name avatar')
      .populate('seller', 'name avatar businessName');

    res.json(populatedChat);
  } catch (error) {
    console.error('Error accepting terms:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 