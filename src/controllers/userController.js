const User = require('../models/user');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, TOKEN_EXPIRES_IN_SECONDS } = require('../config/secrets');

exports.registerUser = async (req, res) => {
  const { email, displayname, password } = req.body;

  if (!email || !password || !displayname) {
    return res
      .status(400)
      .json({ error: 'Email, password, and display name are required fields' });
  }

  // Check if email or name already exists in the database
  const targetEmail = await User.checkDuplicateField('email', email);
  const targetDisplayname = await User.checkDuplicateField(
    'displayname',
    displayname
  );

  if (targetEmail && targetDisplayname) {
    // Both email and display name already exist

    return res
      .status(403)
      .json({ registerError: { emailIsDup: true, displaynameDup: true } });
  } else if (targetEmail) {
    // Email already exists
    return res.status(403).json({ registerError: { emailIsDup: true } });
  } else if (targetDisplayname) {
    // Display name already exists
    return res.status(403).json({ registerError: { displaynameDup: true } });
  } else {
    try {
      const salt = bcryptjs.genSaltSync(12);
      const hashedPassword = bcryptjs.hashSync(password, salt);
      // Create a new user instance
      const newUserDocument = {
        email: email,
        displayname: displayname,
        password: hashedPassword,
        create_date: new Date(), // Add the current timestamp
      };

      const newUserID = await User.createUser(newUserDocument);

      // Registration successful
      return res.status(200).json({ registerSuccess: true });
    } catch (error) {
      // Error occurred while saving the user to the database
      console.error('Error occurred during user registration:', error);
      return res
        .status(500)
        .json({ error: 'Fail to Register, Try again later' });
    }
  }
};

exports.loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const targetUser = await User.getUserByEmail(email);

    if (!targetUser) {
      res
        .status(403)
        .json({ noEmailPass: true, message: "Email or Password didn't exist" });
    } else {
      const isCorrectPassword = bcryptjs.compareSync(
        password,
        targetUser.password
      );
      if (isCorrectPassword) {
        const payload = {
          name: targetUser.displayname,
          id: targetUser._id,
        };

        const token = jwt.sign(payload, JWT_SECRET, {
          expiresIn: TOKEN_EXPIRES_IN_SECONDS,
        });

        res.status(200).send({
          token: token,
          message: 'Login successful.',
        });
      } else {
        res.status(403).json({
          noEmailPass: true,
          message: "Email or Password didn't exist",
        });
      }
    }
  } catch (error) {
    res.status(400).json({
      canLogin: false,
      message: "Can't Login, Please try again later",
    });
  }
};

exports.getUserInfo = async (req, res) => {
  const userInfo = req.user;
  try {
    delete userInfo.password;
    res.status(200).json({ userInfo: userInfo });
  } catch (error) {
    console.error('Error occurred during user retrieval:', error);
    res
      .status(500)
      .json({ error: 'Failed to retrieve user. Please try again later.' });
  }
};

exports.updateUserInfo = async (req, res) => {
  try {
    const updateResult = await User.updateUser(req.user._id, req.body);
    if (!updateResult) {
      return res.status(200).json({ updateResult: false });
    }
    res.status(200).json({ updateResult: true });
  } catch (error) {
    console.error('Error occurred during user update:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.changeUserPassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  try {
    // check old pass is matched?
    let isPasswordMatched = bcryptjs.compareSync(
      oldPassword,
      req.user.password
    );

    if (isPasswordMatched) {
      // hashnew password
      const salt = bcryptjs.genSaltSync(12);
      const hashedNewPassword = bcryptjs.hashSync(newPassword, salt);
      const updateResult = await User.updateUser(req.user._id, {
        password: hashedNewPassword,
      });
      if (!updateResult) {
        return res.status(200).json({
          changePassword: false,
          message: `Password have not changed`,
        });
      }
      res.status(200).json({
        changePassword: true,
        message: `Password Changing Successful!`,
      });
    } else {
      res
        .status(200)
        .json({ changePassword: false, message: `Old password is incorrect` });
    }
  } catch (error) {
    console.error(`Can't change password, Please try again later`, error);
    res.status(500).json({
      changePassword: false,
      error: `Can't change password, Please try again later`,
    });
  }
};

exports.checkAuthen = async (req, res) => {
  try {
    res.status(200).json({
      isSuccess: true,
      error: `Authenticated!`,
    });
  } catch (error) {
    res.status(500).json({
      isSuccess: false,
      error: `Error while authenticating`,
    });
  }
};

exports.getFavorite = async (req, res) => {
  try {
    const response = await User.getFavorite({ user_id: req.user._id });
    res.status(201).json(response);
  } catch (error) {
    console.error('Failed to get favorites:', error);
    res
      .status(500)
      .json({ getFavorites: false, message: 'Failed to retrieve favorites' });
  }
};

exports.addFavorite = async (req, res) => {
  try {
    const response = await User.addFavorite({
      user_id: req.user._id,
      product_id: req.body.product_id,
    });
    res.status(201).json(response);
  } catch (error) {
    console.error('Failed to get favorites:', error);
    res
      .status(500)
      .json({ getFavorites: false, message: 'Failed to retrieve favorites' });
  }
};

exports.removeFavorite = async (req, res) => {
  try {
    const response = await User.removeFavorite({
      user_id: req.user._id,
      product_id: req.query.product_id,
    });
    res.status(201).json(response);
  } catch (error) {
    console.error('Failed to get favorites:', error);
    res
      .status(500)
      .json({ getFavorites: false, message: 'Failed to retrieve favorites' });
  }
};
