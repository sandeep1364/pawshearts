const express = require('express');
const router = express.Router();
const Pet = require('../models/Pet');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/pets');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'pet-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb('Error: Images only (jpeg, jpg, png, webp)!');
    }
  }
});

// Get all pets
router.get('/', async (req, res) => {
  try {
    const pets = await Pet.find()
      .populate('seller', 'name businessName email phoneNumber address')
      .sort({ createdAt: -1 });
    res.json(pets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get adopted pets for a user
router.get('/adopted', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find all pets where this user is the adopter and status is 'adopted'
    const adoptedPets = await Pet.find({
      adopter: userId,
      status: 'adopted'
    }).populate('seller', 'name businessName email phoneNumber');
    
    console.log(`Found ${adoptedPets.length} adopted pets for user:`, userId);
    
    res.json(adoptedPets);
  } catch (error) {
    console.error('Error fetching adopted pets:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get pets listed by a seller/business
router.get('/seller', auth, async (req, res) => {
  try {
    // Ensure the user is a business
    if (req.user.userType !== 'business') {
      return res.status(403).json({ message: 'Only business users can access their listed pets' });
    }
    
    const userId = req.user._id;
    
    // Find all pets where this user is the seller
    const sellerPets = await Pet.find({ seller: userId })
      .sort({ createdAt: -1 });
    
    console.log(`Found ${sellerPets.length} pets listed by seller:`, userId);
    
    res.json(sellerPets);
  } catch (error) {
    console.error('Error fetching seller pets:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a specific pet
router.get('/:id', async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id)
      .populate('seller', 'name businessName email phoneNumber address');
    if (!pet) {
      return res.status(404).json({ message: 'Pet not found' });
    }
    res.json(pet);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add a new pet (business users only)
router.post('/', auth, upload.array('images', 5), async (req, res) => {
  try {
    console.log('Received request to create pet:', {
      user: req.user,
      body: req.body,
      files: req.files ? req.files.length : 0
    });

    // Check if user is a business
    if (req.user.userType !== 'business') {
      // Delete uploaded files if they exist
      if (req.files) {
        req.files.forEach(file => {
          fs.unlinkSync(file.path);
        });
      }
      return res.status(403).json({ message: 'Only business users can add pets' });
    }

    // Validate required fields
    const requiredFields = ['name', 'type', 'breed', 'age', 'gender', 'price', 'description', 'healthInfo', 'requirements'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        fields: missingFields
      });
    }

    // Create pet data with seller ID from authenticated user
    const petData = {
      name: req.body.name,
      type: req.body.type,
      breed: req.body.breed,
      age: req.body.age,
      gender: req.body.gender,
      price: parseFloat(req.body.price),
      description: req.body.description,
      healthInfo: req.body.healthInfo,
      requirements: req.body.requirements,
      seller: req.user._id,
      images: req.files ? req.files.map(file => file.filename) : [],
      status: 'available'
    };

    console.log('Creating pet with data:', { ...petData, images: petData.images.length });
    const pet = new Pet(petData);
    await pet.save();
    res.status(201).json(pet);
  } catch (error) {
    console.error('Error creating pet:', error);
    // Delete uploaded files if they exist
    if (req.files) {
      req.files.forEach(file => {
        fs.unlinkSync(file.path);
      });
    }
    res.status(400).json({ 
      message: error.message,
      details: error.errors ? Object.values(error.errors).map(err => err.message) : []
    });
  }
});

// Update a pet
router.put('/:id', auth, upload.array('images'), async (req, res) => {
  try {
    const petId = req.params.id;
    const updateData = { ...req.body };
    
    // Keep the original seller ID from the pet
    const pet = await Pet.findById(petId);
    if (!pet) {
      return res.status(404).json({ message: 'Pet not found' });
    }

    // Verify that the user is the owner of the pet
    if (pet.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this pet' });
    }

    // Handle image uploads
    if (req.files && req.files.length > 0) {
      updateData.images = req.files.map(file => file.filename);
    } else {
      // Keep existing images if no new ones are uploaded
      delete updateData.images;
    }

    // Update the pet
    const updatedPet = await Pet.findByIdAndUpdate(
      petId,
      { ...updateData, updatedAt: Date.now() },
      { new: true }
    );

    res.json(updatedPet);
  } catch (error) {
    console.error('Update pet error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete a pet (only by the seller)
router.delete('/:id', auth, async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);
    if (!pet) {
      return res.status(404).json({ message: 'Pet not found' });
    }

    // Check if user is the seller
    if (pet.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this pet' });
    }

    // Delete pet images
    pet.images.forEach(image => {
      const imagePath = path.join(__dirname, '../uploads/pets', image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    });

    await pet.deleteOne();
    res.json({ message: 'Pet deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Adopt a pet (regular users only) - DEPRECATED - Use adoption-requests API instead
// This route is kept for backwards compatibility but should not be used for new code
router.post('/:id/adopt', auth, async (req, res) => {
  try {
    console.log('WARNING: Using deprecated adopt endpoint. Use adoption-requests API instead.');
    
    // Check if user is a regular user
    if (req.user.userType !== 'regular') {
      return res.status(403).json({ message: 'Only regular users can adopt pets' });
    }

    const pet = await Pet.findById(req.params.id);
    if (!pet) {
      return res.status(404).json({ message: 'Pet not found' });
    }

    // Check if pet is available
    if (pet.status !== 'available') {
      return res.status(400).json({ message: 'This pet is not available for adoption' });
    }

    // Update pet status to pending
    pet.status = 'pending';
    pet.adopter = req.user._id;
    await pet.save();

    // Log warning message
    console.log(`Pet ${pet._id} marked as pending using deprecated route. No adoption request was created.`);
    
    res.json({ message: 'Adoption request submitted successfully', pet });
  } catch (error) {
    console.error('Adoption error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 