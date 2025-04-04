const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  password: {
    type: String,
    required: true,
    minlength: [6, 'Password must be at least 6 characters long']
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true
  },
  userType: {
    type: String,
    required: [true, 'User type is required'],
    enum: {
      values: ['regular', 'business'],
      message: '{VALUE} is not a valid user type. Must be either "regular" or "business"'
    },
    trim: true
  },
  // Regular user fields
  firstName: {
    type: String,
    trim: true,
    required: function() {
      return this.userType === 'regular';
    }
  },
  lastName: {
    type: String,
    trim: true,
    required: function() {
      return this.userType === 'regular';
    }
  },
  // Business user fields
  businessName: {
    type: String,
    trim: true,
    required: function() {
      return this.userType === 'business';
    }
  },
  businessType: {
    type: String,
    enum: {
      values: ['shelter', 'shop'],
      message: '{VALUE} is not a valid business type'
    },
    required: function() {
      return this.userType === 'business';
    }
  },
  address: {
    type: String,
    trim: true,
    required: function() {
      return this.userType === 'business';
    }
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  zipCode: {
    type: String,
    trim: true
  },
  licenseNumber: {
    type: String,
    trim: true
  },
  licenseExpiry: {
    type: Date
  },
  taxId: {
    type: String,
    trim: true
  },
  profilePicture: {
    type: String,
    default: 'default-profile.jpg'
  },
  // Business verification
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  verificationMessage: String,
  // Business ratings
  ratings: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    review: String,
    date: {
      type: Date,
      default: Date.now
    }
  }],
  averageRating: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password for login
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to update rating
userSchema.methods.updateRating = function() {
  if (this.ratings && this.ratings.length > 0) {
    const totalRating = this.ratings.reduce((acc, curr) => acc + curr.rating, 0);
    this.averageRating = totalRating / this.ratings.length;
  }
};

// Add indexes
userSchema.index({ email: 1 });
userSchema.index({ businessName: 1 });
userSchema.index({ userType: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User; 