const express = require('express');
const router = express.Router();

const bodyParser = require('body-parser');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { client, botData, saveBotData } = require('../../discord_bot_main');

// ✅ Add bodyParser to this router
router.use(bodyParser.urlencoded({ extended: true }));

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/auth');
}

// Routes
router.get('/', checkAuth, (req, res) => {
    res.render('dashboard', {
        user: req.user,
        success: false,
        error: null,
    });
});

// Mail route
router.post('/mail', checkAuth, async (req, res) => {
    const { channel, message } = req.body;

    try {
        const targetChannel = await client.channels.fetch(channel);
        if (!targetChannel || !targetChannel.isTextBased()) throw new Error('Invalid channel ID');

        const mailEmbed = new EmbedBuilder()
            .setTitle('📬 MAIL HAS ARRIVED')
            .setDescription(message)
            .setColor(0xad5eff)
            .setFooter({ text: `Sent by ${req.user.username}` })
            .setTimestamp();

        await targetChannel.send({ embeds: [mailEmbed] });

        res.render('dashboard', {
            user: req.user,
            success: true,
            error: null,
        });
    } catch (err) {
        res.render('dashboard', {
            user: req.user,
            success: false,
            error: err.message,
        });
    }
});

// Set announcement route
router.post('/announcement', checkAuth, async (req, res) => {
    const { type, channel } = req.body;

    try {
        const ch = await client.channels.fetch(channel);
        if (!ch || !ch.isTextBased()) throw new Error('Invalid channel ID');

        botData.announcements[`${type}Enabled`] = true;
        botData.announcements[`${type}ChannelId`] = channel;

        if (typeof saveBotData === 'function') {
            await saveBotData();
        }

        res.render('dashboard', {
            user: req.user,
            success: true,
            error: null,
        });
    } catch (err) {
        console.error('Announcement update error:', err);
        res.render('dashboard', {
            user: req.user,
            success: false,
            error: err.message,
        });
    }
});

module.exports = router;
