const passport = require('passport');
const { Strategy, ExtractJwt } = require('passport-jwt');
const User = require('../../models/user');
const { JWT_SECRET } = require('../secrets');

const option = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: JWT_SECRET,
};

const JWTStrategy = new Strategy(option, async (payload, done) => {
  const targetUser = await User.getUserById(payload.id);
  if (targetUser) {
    done(null, targetUser);
  } else {
    done(null, false);
  }
});

passport.use('jwt', JWTStrategy);
