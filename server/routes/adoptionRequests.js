const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const AdoptionRequest = require('../models/AdoptionRequest');
const mongoose = require('mongoose');
const Pet = require('../models/Pet');

// Get adoption requests for a seller
router.get('/', auth, async (req, res) => {
  try {
    const { sellerId } = req.query;
    console.log('Query params:', req.query);
    console.log('Auth user:', req.user);
    console.log('Fetching adoption requests for seller:', sellerId);
    
    // Ensure consistent ID format for query
    let sellerIdForQuery;
    try {
      // Convert to ObjectId if it's a valid ObjectId string - using proper constructor
      sellerIdForQuery = mongoose.Types.ObjectId.isValid(sellerId) 
        ? new mongoose.Types.ObjectId(sellerId) 
        : sellerId;
      
      console.log('Using sellerId for query:', sellerIdForQuery);
      console.log('Type of sellerId for query:', typeof sellerIdForQuery);
      
      // Extra check for ObjectId specifics
      if (sellerIdForQuery instanceof mongoose.Types.ObjectId) {
        console.log('sellerId is an ObjectId instance');
      } else {
        console.log('sellerId is NOT an ObjectId instance');
      }
    } catch (err) {
      console.error('Error converting sellerId to ObjectId:', err);
      // Fall back to using the original sellerId
      sellerIdForQuery = sellerId;
    }
    
    // First check if any requests exist at all
    const allRequests = await AdoptionRequest.find({});
    console.log('All existing requests in database:', JSON.stringify(allRequests, null, 2));
    
    // DEBUGGING: Check for pending pets to see if they exist
    const pendingPets = await Pet.find({ status: 'pending', seller: sellerIdForQuery });
    console.log('Found pending pets for this seller:', JSON.stringify(pendingPets.map(p => ({
      _id: p._id,
      name: p.name,
      status: p.status,
      seller: p.seller
    })), null, 2));
    
    // Log the query we're about to make
    console.log('Executing query:', { sellerId: sellerIdForQuery });
    
    // Try querying with the ObjectId
    const requests = await AdoptionRequest.find({ sellerId: sellerIdForQuery })
      .populate('userId', 'name email avatar')
      .populate('petId', 'name breed age gender images')
      .sort({ createdAt: -1 });
    
    console.log('Found requests for seller:', JSON.stringify(requests, null, 2));
    
    // If no results found, try with string version as fallback
    if (requests.length === 0 && sellerIdForQuery instanceof mongoose.Types.ObjectId) {
      console.log('No results with ObjectId, trying with string version');
      const stringIdRequests = await AdoptionRequest.find({ sellerId: sellerIdForQuery.toString() })
        .populate('userId', 'name email avatar')
        .populate('petId', 'name breed age gender images')
        .sort({ createdAt: -1 });
      
      console.log('Results with string version:', JSON.stringify(stringIdRequests, null, 2));
      
      if (stringIdRequests.length > 0) {
        console.log('Found results with string version!');
        return res.json(stringIdRequests);
      }
    }
    
    res.json(requests);
  } catch (error) {
    console.error('Error fetching adoption requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new adoption request
router.post('/', auth, async (req, res) => {
  try {
    const { petId, sellerId } = req.body;
    const userId = req.user._id;
    
    console.log('Creating adoption request with data:', {
      petId: petId,
      sellerId: sellerId,
      userId: userId,
      userIdType: typeof userId,
      sellerIdType: typeof sellerId,
      petIdType: typeof petId
    });

    // Check if request already exists
    const existingRequest = await AdoptionRequest.findOne({
      petId,
      userId,
      status: 'pending'
    });

    if (existingRequest) {
      console.log('Existing request found:', JSON.stringify(existingRequest, null, 2));
      return res.status(400).json({ message: 'Adoption request already exists' });
    }

    // Ensure IDs are stored consistently
    // Convert string IDs to ObjectIDs if needed (MongoDB prefers ObjectIDs)
    const requestData = {
      petId: typeof petId === 'string' && mongoose.Types.ObjectId.isValid(petId) ? new mongoose.Types.ObjectId(petId) : petId,
      userId: typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId,
      sellerId: typeof sellerId === 'string' && mongoose.Types.ObjectId.isValid(sellerId) ? new mongoose.Types.ObjectId(sellerId) : sellerId,
      status: 'pending'
    };
    
    console.log('Processed request data:', JSON.stringify(requestData, null, 2));
    
    const request = new AdoptionRequest(requestData);

    console.log('About to save request:', JSON.stringify(request, null, 2));
    await request.save();
    console.log('Request saved successfully');
    
    // Verify the request was saved
    const savedRequest = await AdoptionRequest.findById(request._id);
    console.log('Saved request (raw):', JSON.stringify(savedRequest, null, 2));
    
    // Test the query that will be used later to fetch this request
    const queryTest = await AdoptionRequest.find({ sellerId: requestData.sellerId });
    console.log('Query test results:', JSON.stringify(queryTest, null, 2));
    console.log('Query test count:', queryTest.length);
    
    // Try both string and ObjectId formats
    if (typeof sellerId === 'string' && mongoose.Types.ObjectId.isValid(sellerId)) {
      const queryTestObj = await AdoptionRequest.find({ sellerId: new mongoose.Types.ObjectId(sellerId) });
      console.log('Query test with ObjectId:', JSON.stringify(queryTestObj, null, 2));
      console.log('Query test with ObjectId count:', queryTestObj.length);
    } else if (requestData.sellerId instanceof mongoose.Types.ObjectId) {
      const queryTestStr = await AdoptionRequest.find({ sellerId: requestData.sellerId.toString() });
      console.log('Query test with String:', JSON.stringify(queryTestStr, null, 2));
      console.log('Query test with String count:', queryTestStr.length);
    }
    
    const populatedRequest = await AdoptionRequest.findById(request._id)
      .populate('userId', 'name email')
      .populate('petId', 'name')
      .populate('sellerId', 'name');
    console.log('Saved and populated request:', JSON.stringify(populatedRequest, null, 2));
    
    res.status(201).json(request);
  } catch (error) {
    console.error('Error creating adoption request:', error);
    if (error.name === 'ValidationError') {
      console.error('Validation error details:', error.errors);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update adoption request status
router.patch('/:id', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const request = await AdoptionRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    request.status = status;
    await request.save();
    res.json(request);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get adoption requests for a user (their adoption requests)
router.get('/user', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    console.log('Fetching adoption requests for user:', userId);
    
    // Find all adoption requests made by this user
    const requests = await AdoptionRequest.find({ userId })
      .populate('petId', 'name breed age gender images status price type')
      .populate('sellerId', 'name businessName email')
      .sort({ createdAt: -1 });
    
    console.log(`Found ${requests.length} adoption requests for user:`, userId);
    
    res.json(requests);
  } catch (error) {
    console.error('Error fetching user adoption requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 