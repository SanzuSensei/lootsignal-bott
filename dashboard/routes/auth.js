const express = require('express');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { CLIENT_ID, CLIENT_SECRET, CALLBACK_URL, SCOPES } = require('../config');

const router = express.Router();

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: SCOPES,
}, (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

router.get('/auth/discord', passport.authenticate('discord'));

router.get('/auth/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/dashboard');
    }
);
module.exports = router;
