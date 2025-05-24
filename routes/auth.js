const express = require('express');
const router = express.Router();
const admin = require('../config/firebase-admin');
const { User } = require('../models/User');

// Admin login endpoint
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Admin login attempt:', { email });

    // Verify admin credentials
    if (email !== 'hiteshboss@gmail.com' || password !== 'boss321') {
      console.log('Invalid admin credentials');
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // Create custom token for admin
    // The first parameter must be a valid Firebase UID
    // For admin, we use a fixed UID 'admin-user-id'
    const adminUid = 'admin-user-id';
    let customToken;
    
    try {
      console.log('Starting admin authentication process...');
      
      // First check if this admin user exists in Firebase
      try {
        await admin.auth().getUser(adminUid);
        console.log('Admin user exists in Firebase');
      } catch (userError) {
        console.log('Admin user error:', userError.code, userError.message);
        
        if (userError.code === 'auth/user-not-found') {
          // Create the admin user in Firebase if it doesn't exist
          try {
            await admin.auth().createUser({
              uid: adminUid,
              email: 'hiteshboss@gmail.com',
              displayName: 'Admin User'
            });
            console.log('Created admin user in Firebase');
          } catch (createError) {
            console.error('Error creating admin user:', createError);
            return res.status(500).json({
              success: false,
              message: 'Error creating admin user',
              error: createError.message
            });
          }
        } else {
          console.error('Unexpected user error:', userError);
          return res.status(500).json({
            success: false,
            message: 'Error checking admin user',
            error: userError.message
          });
        }
      }
      
      // Create custom token with admin claims
      try {
        console.log('Creating custom token for admin...');
        customToken = await admin.auth().createCustomToken(adminUid, {
          isAdmin: true
        });
        console.log('Admin custom token created successfully');
      } catch (tokenError) {
        console.error('Error creating custom token:', tokenError);
        return res.status(500).json({
          success: false,
          message: 'Error creating authentication token',
          error: tokenError.message
        });
      }
    } catch (error) {
      console.error('Unexpected error in admin authentication:', error);
      return res.status(500).json({
        success: false,
        message: 'Unexpected error during admin login',
        error: error.message
      });
    }

    res.json({
      success: true,
      data: {
        customToken,
        email,
        isAdmin: true
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during admin login'
    });
  }
});

// Verify token endpoint
router.post('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('Verify token request received');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No token provided in request');
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    console.log('Verifying token...');

    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('Token decoded:', { 
      uid: decodedToken.uid, 
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture 
    });

    if (!decodedToken.uid) {
      throw new Error('Invalid token: No user ID found');
    }

    // Use findOneAndUpdate with upsert to handle both create and update cases
    const user = await User.findOneAndUpdate(
      { firebaseUid: decodedToken.uid },
      {
        $set: {
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email.split('@')[0],
          photoURL: decodedToken.picture || null,
          isAdmin: decodedToken.email === 'hiteshboss@gmail.com',
          lastLogin: new Date()
        }
      },
      {
        new: true, // Return the updated document
        upsert: true, // Create if doesn't exist
        setDefaultsOnInsert: true // Apply schema defaults on insert
      }
    );

    console.log('User found/created in verify endpoint:', {
      email: user.email,
      isAdmin: user.isAdmin,
      lastLogin: user.lastLogin
    });

    res.json({
      success: true,
      data: {
        email: user.email,
        name: user.name,
        photoURL: user.photoURL,
        isAdmin: user.isAdmin,
        semester: user.semester,
        branch: user.branch
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      message: error.message || 'Invalid or expired token',
      error: error.code === 11000 ? 'User already exists with different credentials' : error.message
    });
  }
});

// Update profile endpoint
router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    if (!decodedToken.uid) {
      throw new Error('Invalid token: No user ID found');
    }

    const { name, semester, branch } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (semester) updates.semester = semester;
    if (branch) updates.branch = branch;

    const user = await User.findOneAndUpdate(
      { firebaseUid: decodedToken.uid },
      { $set: updates },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        email: user.email,
        name: user.name,
        photoURL: user.photoURL,
        isAdmin: user.isAdmin,
        semester: user.semester,
        branch: user.branch
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
});

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, semester, branch } = req.body;
    console.log('Registration attempt:', { email, name });

    // Create user in Firebase
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name
    });

    // Create user in MongoDB
    const user = await User.create({
      firebaseUid: userRecord.uid,
      email: userRecord.email,
      name: userRecord.displayName,
      semester,
      branch,
      isAdmin: false
    });

    console.log('User registered successfully:', {
      email: user.email,
      name: user.name
    });

    res.json({
      success: true,
      data: {
        email: user.email,
        name: user.name,
        photoURL: user.photoURL,
        isAdmin: user.isAdmin,
        semester: user.semester,
        branch: user.branch
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error during registration',
      error: error.code === 11000 ? 'Email already exists' : error.message
    });
  }
});

module.exports = router; 