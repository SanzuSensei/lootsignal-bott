const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    Events,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActivityType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const fetch = require('node-fetch'); // For GitHub API syncing

const CONFIG = {
    TOKEN: process.env.TOKEN || 'your-token-here',
    CLIENT_ID: '1392196089142313060',
    GUILD_ID: '1392439850120249394',
    LOG_CHANNEL_ID: '1392439850971697293',
    ALLOWED_ROLE_IDS: ['1392439850149351552', '1392439850120249401'], // mod/admin roles allowed for commands
    ALLOWED_USER_IDS: ['700124750571110420'], // specific allowed users (e.g. owner)
    OWNER_USER_ID: '700124750571110420', // for logout command
    GITHUB_REPO_OWNER: 'SanzuSensei',
    GITHUB_REPO_NAME: 'discord-bot-dataa',
    GITHUB_FILE_PATH: 'botData.json',
    GITHUB_ACCESS_TOKEN: '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',
};

const DATA_FILE = path.resolve(__dirname, 'botData.json');

const DARK_EMBED_COLOR = 0x4b0082; // Dark Indigo
const ACCENT_COLOR = 0xad5eff; // Soft violet

// Default bot data structure
let botData = {
    giveaways: [],
    bans: [],
    kicks: [],
    mutes: [],
    counters: {
        giveawaysStarted: 0,
        bansDone: 0,
        kicksDone: 0,
        mutesDone: 0,
        unmutesDone: 0,
        unbansDone: 0,
    },
    announcements: {
        welcomeEnabled: false,
        welcomeChannelId: null,
        goodbyeEnabled: false,
        goodbyeChannelId: null,
        boostEnabled: false,
        boostChannelId: null,
    },
};

// Load local file or fallback to GitHub data
async function loadBotData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const localData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            botData = localData;
            console.log('Loaded botData from local file.');
        } else {
            console.log('Local data file not found, loading from GitHub...');
            await loadBotDataFromGitHub();
        }
    } catch (e) {
        console.error('Failed to load botData locally:', e);
        await loadBotDataFromGitHub();
    }
}

// Load from GitHub repo
async function loadBotDataFromGitHub() {
    try {
        const url = `https://api.github.com/repos/${CONFIG.GITHUB_REPO_OWNER}/${CONFIG.GITHUB_REPO_NAME}/contents/${CONFIG.GITHUB_FILE_PATH}`;
        const res = await fetch(url, {
            headers: {
                Authorization: `token ${CONFIG.GITHUB_ACCESS_TOKEN}`,
                Accept: 'application/vnd.github.v3.raw',
            },
        });
        if (!res.ok) throw new Error(`GitHub response: ${res.statusText}`);

        const data = await res.json();
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
            // Sometimes GitHub returns metadata, but with Accept header above, it should be raw JSON
            botData = data;
        } else {
            botData = data;
        }
        // Save locally for fallback
        saveBotData();
        console.log('Loaded botData from GitHub and saved locally.');
    } catch (e) {
        console.error('Failed to load botData from GitHub:', e);
    }
}

// Save locally and to GitHub
async function saveBotData() {
    try {
        const jsonStr = JSON.stringify(botData, null, 2);
        fs.writeFileSync(DATA_FILE, jsonStr);

        // Push update to GitHub
        await saveBotDataToGitHub(jsonStr);
    } catch (e) {
        console.error('Failed to save botData:', e);
    }
}

// Helper: get SHA of current file on GitHub (required for updating content)
async function getGitHubFileSHA() {
    try {
        const url = `https://api.github.com/repos/${CONFIG.GITHUB_REPO_OWNER}/${CONFIG.GITHUB_REPO_NAME}/contents/${CONFIG.GITHUB_FILE_PATH}`;
        const res = await fetch(url, {
            headers: {
                Authorization: `token ${CONFIG.GITHUB_ACCESS_TOKEN}`,
            },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.sha || null;
    } catch {
        return null;
    }
}

// Save updated data to GitHub repo
async function saveBotDataToGitHub(content) {
    try {
        const sha = await getGitHubFileSHA();

        const url = `https://api.github.com/repos/${CONFIG.GITHUB_REPO_OWNER}/${CONFIG.GITHUB_REPO_NAME}/contents/${CONFIG.GITHUB_FILE_PATH}`;
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                Authorization: `token ${CONFIG.GITHUB_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: 'Update botData.json via bot',
                content: Buffer.from(content).toString('base64'),
                sha: sha || undefined,
            }),
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error('GitHub save failed:', errorText);
        } else {
            console.log('botData saved to GitHub repo.');
        }
    } catch (e) {
        console.error('Failed to save botData to GitHub:', e);
    }
}

// Duration parsing helper
function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)\s*(s|m|h|d|w|mo|y)$/i);
    if (!match) return null;
    const num = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multipliers = {
        s: 1000,
        m: 60000,
        h: 3600000,
        d: 86400000,
        w: 604800000,
        mo: 2629800000,
        y: 31557600000,
    };
    return num * (multipliers[unit] || 0);
}

// Truth or Dare questions
const truthOrDareQuestions = [
    "Truth: What's your biggest fear?",
    'Truth: Have you ever lied to your best friend?',
    'Dare: Send a funny selfie in the chat.',
    'Dare: Do 10 push-ups and send a message when done.',
    "Truth: What's a secret you've never told anyone?",
    "Dare: Change your nickname to 'I love Discord' for 10 minutes.",
    'Truth: Who do you have a crush on?',
    'Dare: Sing a song snippet in voice chat.',
];

// Define commands
const commands = [
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Start a giveaway!')
        .addStringOption(opt => opt
            .setName('item')
            .setDescription('What is the giveaway for?')
            .setRequired(true))
        .addIntegerOption(opt => opt
            .setName('winners')
            .setDescription('Number of winners')
            .setRequired(true)
            .setMinValue(1))
        .addStringOption(opt => opt
            .setName('duration')
            .setDescription('Duration (e.g. 10m, 1h)')
            .setRequired(true))
        .addRoleOption(opt => opt
            .setName('pingrole')
            .setDescription('Role to ping for the giveaway')
            .setRequired(false)),

    new SlashCommandBuilder()
        .setName('mail')
        .setDescription('Send an announcement')
        .addChannelOption(opt => opt
            .setName('channel')
            .setDescription('Channel to send announcement')
            .setRequired(true))
            .addRoleOption(opt => opt
            .setName('pingrole')
            .setDescription('Role to ping')
            .setRequired(true)),

    new SlashCommandBuilder()
        .setName('host')
        .setDescription('Host an event')
        .addChannelOption(opt => opt
            .setName('channel')
            .setDescription('Channel to post event')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('game')
            .setDescription('Game name')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('link')
            .setDescription('Join link')
            .setRequired(true))
        .addRoleOption(opt => opt
            .setName('pingrole')
            .setDescription('Role to ping for the event')
            .setRequired(false)),

    new SlashCommandBuilder()
        .setName('rep')
        .setDescription('Post event result')
        .addChannelOption(opt => opt
            .setName('channel')
            .setDescription('Channel to post result')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('winner')
            .setDescription('Event winner')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('prize')
            .setDescription('Prize')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('message')
            .setDescription('Message link')
            .setRequired(true))
        .addAttachmentOption(opt => opt
            .setName('proof')
            .setDescription('Proof image')
            .setRequired(true)),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a member')
        .addUserOption(opt => opt
            .setName('user')
            .setDescription('User to mute')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('reason')
            .setDescription('Reason for mute')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('duration')
            .setDescription('Mute duration (e.g. 10m)')
            .setRequired(false)),

    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a member')
        .addUserOption(opt => opt
            .setName('user')
            .setDescription('User to unmute')
            .setRequired(true)),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member')
        .addUserOption(opt => opt
            .setName('user')
            .setDescription('User to ban')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('reason')
            .setDescription('Reason for ban')
            .setRequired(true)),

    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a member')
        .addUserOption(opt => opt
            .setName('user')
            .setDescription('User to unban')
            .setRequired(true)),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member')
        .addUserOption(opt => opt
            .setName('user')
            .setDescription('User to kick')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('reason')
            .setDescription('Reason for kick')
            .setRequired(true)),

    new SlashCommandBuilder()
        .setName('truthordare')
        .setDescription('Play truth or dare! (Anyone can use)'),


    new SlashCommandBuilder()
        .setName('help')
        .setDescription('List all commands'),

    new SlashCommandBuilder()
        .setName('logout')
        .setDescription('Shutdown the bot (Owner only)'),

    new SlashCommandBuilder()
        .setName('setannouncement')
        .setDescription('Configure welcome/goodbye/boost announcements')
        .addStringOption(opt => opt
            .setName('type')
            .setDescription('Which announcement to configure')
            .setRequired(true)
            .addChoices(
                { name: 'welcome', value: 'welcome' },
                { name: 'goodbye', value: 'goodbye' },
                { name: 'boost', value: 'boost' },
            ))
        .addBooleanOption(opt => opt
            .setName('enable')
            .setDescription('Enable or disable announcement')
            .setRequired(true))
        .addChannelOption(opt => opt
            .setName('channel')
            .setDescription('Channel to send the announcements')
            .setRequired(false)),

    new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magic 8-ball a question')
        .addStringOption(opt =>
            opt.setName('question')
                .setDescription('Your question for the 8-ball')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('fact')
        .setDescription('Get a random fun fact'),

    new SlashCommandBuilder()
        .setName('animal')
        .setDescription('Get a random animal image!')
        .addStringOption(opt =>
            opt.setName('type')
                .setDescription('Choose the animal type')
                .setRequired(true)
                .addChoices(
                    { name: 'Dog', value: 'dog' },
                    { name: 'Cat', value: 'cat' }
                )),

];

// Register commands
const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
(async () => {
    try {
        await rest.put(
            Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID),
            { body: commands }
        );
        console.log('Commands registered');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
})();

// Create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
});

// Logging helper
async function logAction(content, embeds = []) {
    try {
        const channel = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) return;
        await channel.send({ content, embeds });
    } catch (err) {
        console.error('Failed to log action:', err);
    }
}

// DM notification helper
async function notifyUser(user, guildName, action, reason = '', durationStr = '') {
    try {
        let msg = `You have been **${action}** in **${guildName}**.`;
        if (durationStr) msg += ` Duration: ${durationStr}.`;
        if (reason) msg += ` Reason: ${reason}.`;
        await user.send(msg);
    } catch {
        console.log(`Couldn't DM user ${user.tag} about ${action}.`);
    }
}

// On ready
client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // ✅ Set bot status and activity
    client.user.setPresence({
        status: 'dnd', // 'online', 'idle', 'dnd', 'invisible'
        activities: [{
            name: '/lostsignal',
            type: ActivityType.Playing, // or Listening, Watching, etc.
        }],
    });

    // Send login embed to log channel
    try {
        const logChannel = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID);
        if (logChannel?.isTextBased()) {
            const loginEmbed = new EmbedBuilder()
                .setTitle('Bot Logged In')
                .setDescription('Bot has started successfully and is ready to serve!')
                .setColor(ACCENT_COLOR)
                .setImage('https://c.tenor.com/gfP57iNhhN0AAAAC/dance-pink.gif')
                .setTimestamp();
            await logChannel.send({ embeds: [loginEmbed] });
        }
    } catch (err) {
        console.error('Failed to send login message:', err);
    }

    // Restore giveaways timers
    const now = Date.now();
    for (const giveaway of botData.giveaways) {
        const remaining = giveaway.endsAt - now;
        if (remaining > 0) {
            scheduleGiveawayEnd(giveaway, remaining);
        } else {
            // Giveaway expired while bot offline, end immediately
            endGiveaway(giveaway);
        }
    }
});

// Giveaway scheduling
function scheduleGiveawayEnd(giveaway, delay) {
    setTimeout(() => endGiveaway(giveaway), delay);
}

// Giveaway ending logic
async function endGiveaway(giveaway) {
    try {
        const guild = await client.guilds.fetch(CONFIG.GUILD_ID).catch(() => null);
        if (!guild) return;

        const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (!message) return;

        const reaction = message.reactions.cache.get('🎉');
        if (!reaction) {
            await channel.send('No one participated in the giveaway.');
            return;
        }

        const users = await reaction.users.fetch();
        const participants = users.filter(u => !u.bot);

        if (participants.size === 0) {
            await channel.send('No valid participants for the giveaway.');
        } else {
            const winners = [];
            const participantsArray = [...participants.values()];
            const winnerCount = Math.min(giveaway.winners, participantsArray.length);

            while (winners.length < winnerCount) {
                const pick = participantsArray[Math.floor(Math.random() * participantsArray.length)];
                if (!winners.includes(pick)) winners.push(pick);
            }

            const winnersMentions = winners.map(w => `<@${w.id}>`).join(', ');
            await channel.send(`🎉 Giveaway ended! Congratulations to: ${winnersMentions} for **${giveaway.item}**!`);

            await logAction(`Giveaway ended for item "${giveaway.item}". Winners: ${winnersMentions}`);
        }

        botData.giveaways = botData.giveaways.filter(g => g.messageId !== giveaway.messageId);
        saveBotData();
    } catch (e) {
        console.error('Error ending giveaway:', e);
    }
}

// Welcome event
client.on('guildMemberAdd', async member => {
    try {
        if (!botData.announcements.welcomeEnabled) return;
        if (!botData.announcements.welcomeChannelId) return;

        const channel = await member.guild.channels.fetch(botData.announcements.welcomeChannelId).catch(() => null);
        if (!channel?.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setTitle('Welcome!')
            .setDescription(`👋 Welcome to the server, <@${member.id}>!`)
            .setColor(ACCENT_COLOR)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Welcome message error:', e);
    }
});

// Goodbye event
client.on('guildMemberRemove', async member => {
    try {
        if (!botData.announcements.goodbyeEnabled) return;
        if (!botData.announcements.goodbyeChannelId) return;

        const channel = await member.guild.channels.fetch(botData.announcements.goodbyeChannelId).catch(() => null);
        if (!channel?.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setTitle('Goodbye')
            .setDescription(`👋 <@${member.id}> has left the server.`)
            .setColor(ACCENT_COLOR)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Goodbye message error:', e);
    }
});

// Boost event
client.on('guildBoostLevelUp', async (guild, oldLevel, newLevel) => {
    try {
        if (!botData.announcements.boostEnabled) return;
        if (!botData.announcements.boostChannelId) return;

        const channel = await guild.channels.fetch(botData.announcements.boostChannelId).catch(() => null);
        if (!channel?.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setTitle('Server Boost!')
            .setDescription(`Thanks for boosting the server! Boost level increased from ${oldLevel} to ${newLevel}.`)
            .setColor(ACCENT_COLOR)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Boost message error:', e);
    }
});

// Moderation helper to check permissions
function isAllowed(interaction) {
    if (CONFIG.ALLOWED_USER_IDS.includes(interaction.user.id)) return true;
    return interaction.member.roles.cache.some(r => CONFIG.ALLOWED_ROLE_IDS.includes(r.id));
}

// Manage mute role creation/check
async function getOrCreateMuteRole(guild) {
    let muteRole = guild.roles.cache.find(r => r.name === 'Muted');
    if (!muteRole) {
        try {
            muteRole = await guild.roles.create({
                name: 'Muted',
                color: '#555555',
                permissions: [],
                reason: 'Mute role needed for muting members',
            });
            // Put muteRole above all roles (highest possible)
            await muteRole.setPosition(guild.roles.highest.position - 1);
            // Deny sending messages in all channels
            guild.channels.cache.forEach(async channel => {
                if (!channel.permissionsLocked) {
                    await channel.permissionOverwrites.edit(muteRole, {
                        SendMessages: false,
                        Speak: false,
                        AddReactions: false,
                    });
                }
            });
            console.log('Created Muted role and set channel perms');
        } catch (e) {
            console.error('Failed to create mute role:', e);
        }
    }
    return muteRole;
}

// On interaction create
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isModalSubmit() && interaction.customId.startsWith('mail-modal-')) {
        const [channelId, roleId] = interaction.customId.replace('mail-modal-', '').split('_');
        const messageText = interaction.fields.getTextInputValue('mailText');
        const channel = await client.channels.fetch(channelId).catch(() => null);

        if (!channel?.isTextBased()) {
            await interaction.reply({ content: 'Could not send mail. Channel invalid.', ephemeral: true });
            return;
        }

        const mailEmbed = new EmbedBuilder()
            .setTitle('📬 MAIL HAS ARRIVED')
            .setDescription(messageText)
            .setColor(ACCENT_COLOR)
            .setFooter({ text: `Sent by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        const pingText = roleId && roleId !== 'none' ? `<@&${roleId}>` : '';

        await channel.send({ content: pingText, embeds: [mailEmbed] });
        await interaction.reply({ content: '📨 Mail delivered successfully!', ephemeral: true });
        await logAction(`<@${interaction.user.id}> sent mail in <#${channelId}>.`);
    }
    if (!interaction.isChatInputCommand()) return;

    // Commands anyone can use
    const publicCommands = ['truthordare', 'help', 'animal', 'fact', '8ball'];

    // Commands that require allowed roles/users
    const protectedCommands = ['mute', 'unmute', 'ban', 'unban', 'kick', 'giveaway', 'mail', 'host', 'rep'];

    if (protectedCommands.includes(interaction.commandName) && !isAllowed(interaction)) {
        await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }

    switch (interaction.commandName) {
        case 'giveaway': {
            const item = interaction.options.getString('item');
            const winners = interaction.options.getInteger('winners');
            const duration = interaction.options.getString('duration');
            const pingRole = interaction.options.getRole('pingrole');

            const msDuration = parseDuration(duration);
            if (!msDuration) {
                await interaction.reply({ content: 'Invalid duration format. Example: 10m, 1h, 1d', ephemeral: true });
                return;
            }

            const endsAt = Date.now() + msDuration;
            const giveaway = {
                item,
                winners,
                endsAt,
                channelId: interaction.channelId,
                messageId: null,
                pingRoleId: pingRole?.id || null,
                startedBy: interaction.user.id,
            };

            botData.giveaways.push(giveaway);
            botData.counters.giveawaysStarted++;
            saveBotData();

            const pingText = pingRole ? `<@&${pingRole.id}>` : '';
            const embed = new EmbedBuilder()
                .setTitle(`Giveaway Started!`)
                .setDescription(`🎉 Prize: **${item}**\n⏰ Duration: **${duration}**\n🎯 Winners: **${winners}**\nHost: <@${interaction.user.id}>\n${pingText}`)
                .setColor(ACCENT_COLOR)
                .setTimestamp();

            const msg = await interaction.reply({ embeds: [embed], fetchReply: true });

            giveaway.messageId = msg.id;
            saveBotData();

            scheduleGiveawayEnd(giveaway, msDuration);

            await logAction(`Giveaway started by <@${interaction.user.id}> for **${item}** lasting ${duration}`);

            break;
        }
        case 'mute': {
            await interaction.deferReply({ ephemeral: true });
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            const durationStr = interaction.options.getString('duration');
            const guild = interaction.guild;

            if (!guild) {
                await interaction.editReply({ content: 'This command can only be used in a server.' });
                return;
            }

            try {
                const member = await guild.members.fetch(user.id).catch(() => null);
                if (!member) {
                    await interaction.editReply({ content: 'User not found in this server.' });
                    return;
                }

                if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                    await interaction.editReply({ content: 'You cannot mute someone with an equal or higher role.' });
                    return;
                }

                const muteRole = await getOrCreateMuteRole(guild);
                if (!muteRole) {
                    await interaction.editReply({ content: 'Failed to create or find a mute role.' });
                    return;
                }

                const rolesToRemove = member.roles.cache.filter(r => r.id !== guild.id && r.id !== muteRole.id);
                const roleIds = rolesToRemove.map(r => r.id);
                botData.mutes.push({
                    userId: user.id,
                    removedRoles: roleIds,
                    endsAt: null,
                });

                await member.roles.remove(roleIds, `Muted by ${interaction.user.tag} - Reason: ${reason}`);
                await member.roles.add(muteRole, `Muted by ${interaction.user.tag} - Reason: ${reason}`);

                let msDuration = null;
                let endsAt = null;
                if (durationStr) {
                    msDuration = parseDuration(durationStr);
                    if (!msDuration) {
                        await interaction.editReply({ content: 'Invalid duration format. Example: 10m, 1h, 1d' });
                        return;
                    }
                    endsAt = Date.now() + msDuration;
                    botData.mutes.find(m => m.userId === user.id).endsAt = endsAt;
                }

                botData.counters.mutesDone++;
                saveBotData();

                await interaction.editReply({ content: `User <@${user.id}> muted${durationStr ? ` for ${durationStr}` : ''}. Reason: ${reason}` });

                await notifyUser(user, guild.name, 'muted', reason, durationStr || '');
                await logAction(`<@${user.id}> was muted by <@${interaction.user.id}>. Reason: ${reason} Duration: ${durationStr || 'Permanent'}`);

                if (msDuration) {
                    setTimeout(async () => {
                        const guildMember = await guild.members.fetch(user.id).catch(() => null);
                        if (!guildMember) return;

                        const muteDataIndex = botData.mutes.findIndex(m => m.userId === user.id);
                        if (muteDataIndex === -1) return;

                        await guildMember.roles.remove(muteRole, 'Automatic unmute after duration elapsed');
                        const rolesToRestore = botData.mutes[muteDataIndex].removedRoles;
                        if (rolesToRestore.length) await guildMember.roles.add(rolesToRestore, 'Restoring roles after unmute');

                        botData.mutes.splice(muteDataIndex, 1);
                        botData.counters.unmutesDone++;
                        saveBotData();

                        await notifyUser(user, guild.name, 'unmuted', 'Your mute duration has ended.');
                        await logAction(`<@${user.id}> was automatically unmuted after their mute duration expired.`);
                    }, msDuration);
                }
            } catch (e) {
                console.error('Mute command error:', e);
                await interaction.editReply({ content: 'Failed to mute the user.' });
            }
            break;
        }
        case 'unmute': {
            await interaction.deferReply({ ephemeral: true });
            const user = interaction.options.getUser('user');
            const guild = interaction.guild;

            if (!guild) {
                await interaction.editReply({ content: 'This command can only be used in a server.' });
                return;
            }

            try {
                const member = await guild.members.fetch(user.id).catch(() => null);
                if (!member) {
                    await interaction.editReply({ content: 'User not found in this server.' });
                    return;
                }

                const muteRole = guild.roles.cache.find(r => r.name === 'Muted');
                if (!muteRole || !member.roles.cache.has(muteRole.id)) {
                    await interaction.editReply({ content: 'User is not muted.' });
                    return;
                }

                const muteIndex = botData.mutes.findIndex(m => m.userId === user.id);
                if (muteIndex === -1) {
                    await interaction.editReply({ content: 'Mute data not found for this user.' });
                    return;
                }

                await member.roles.remove(muteRole, `Unmuted by ${interaction.user.tag}`);

                const removedRoles = botData.mutes[muteIndex].removedRoles;
                if (removedRoles.length) await member.roles.add(removedRoles, 'Restoring roles after unmute');

                botData.mutes.splice(muteIndex, 1);
                botData.counters.unmutesDone++;
                saveBotData();

                await interaction.editReply({ content: `<@${user.id}> has been unmuted.` });
                await notifyUser(user, guild.name, 'unmuted', 'Your mute has been lifted.');
                await logAction(`<@${user.id}> was unmuted by <@${interaction.user.id}>.`);
            } catch (e) {
                console.error('Unmute command error:', e);
                await interaction.editReply({ content: 'Failed to unmute the user.' });
            }
            break;
        }
        case 'ban': {
            await interaction.deferReply({ ephemeral: true });
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            const guild = interaction.guild;

            if (!guild) {
                await interaction.editReply({ content: 'This command can only be used in a server.' });
                return;
            }

            try {
                const member = await guild.members.fetch(user.id).catch(() => null);
                if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
                    await interaction.editReply({ content: 'You cannot ban someone with an equal or higher role.' });
                    return;
                }

                await user.send(`You have been **banned** from **${guild.name}**. Reason: ${reason}`).catch(() => { });

                await guild.members.ban(user.id, { reason });

                botData.bans.push({ userId: user.id, reason, bannedBy: interaction.user.id, timestamp: Date.now() });
                botData.counters.bansDone++;
                saveBotData();

                await interaction.editReply({ content: `<@${user.id}> has been banned. Reason: ${reason}` });

                await logAction(`<@${user.id}> was banned by <@${interaction.user.id}>. Reason: ${reason}`);
            } catch (e) {
                console.error('Ban command error:', e);
                await interaction.editReply({ content: 'Failed to ban the user.' });
            }
            break;
        }
        case 'unban': {
            await interaction.deferReply({ ephemeral: true });
            const user = interaction.options.getUser('user');
            const guild = interaction.guild;

            if (!guild) {
                await interaction.editReply({ content: 'This command can only be used in a server.' });
                return;
            }

            try {
                const bans = await guild.bans.fetch();
                const banInfo = bans.find(b => b.user.id === user.id);
                if (!banInfo) {
                    await interaction.editReply({ content: 'User is not banned.' });
                    return;
                }

                await guild.members.unban(user.id, `Unbanned by ${interaction.user.tag}`);

                botData.bans = botData.bans.filter(b => b.userId !== user.id);
                botData.counters.unbansDone++;
                saveBotData();

                await interaction.editReply({ content: `<@${user.id}> has been unbanned.` });

                await notifyUser(user, guild.name, 'unbanned', 'Your ban has been lifted.');
                await logAction(`<@${user.id}> was unbanned by <@${interaction.user.id}>.`);
            } catch (e) {
                console.error('Unban command error:', e);
                await interaction.editReply({ content: 'Failed to unban the user.' });
            }
            break;
        }
        case 'kick': {
            await interaction.deferReply({ ephemeral: true });
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            const guild = interaction.guild;

            if (!guild) {
                await interaction.editReply({ content: 'This command can only be used in a server.' });
                return;
            }

            try {
                const member = await guild.members.fetch(user.id).catch(() => null);
                if (!member) {
                    await interaction.editReply({ content: 'User not found in this server.' });
                    return;
                }
                if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                    await interaction.editReply({ content: 'You cannot kick someone with an equal or higher role.' });
                    return;
                }

                await user.send(`You have been **kicked** from **${guild.name}**. Reason: ${reason}`).catch(() => { });

                await member.kick(reason);

                botData.kicks.push({ userId: user.id, reason, kickedBy: interaction.user.id, timestamp: Date.now() });
                botData.counters.kicksDone++;
                saveBotData();

                await interaction.editReply({ content: `<@${user.id}> has been kicked. Reason: ${reason}` });

                await logAction(`<@${user.id}> was kicked by <@${interaction.user.id}>. Reason: ${reason}`);
            } catch (e) {
                console.error('Kick command error:', e);
                await interaction.editReply({ content: 'Failed to kick the user.' });
            }
            break;
        }
        case 'truthordare': {
            const question = truthOrDareQuestions[Math.floor(Math.random() * truthOrDareQuestions.length)];
            await interaction.reply({ content: question });
            break;
        }
        case 'help': {
            const cmds = commands.map(c => `**/${c.name}** - ${c.description}`).join('\n');
            await interaction.reply({ content: `Available commands:\n${cmds}`, ephemeral: true });
            break;
        }
        case 'logout': {
            if (interaction.user.id !== CONFIG.OWNER_USER_ID) {
                await interaction.reply({ content: 'Only the bot owner can logout the bot.', ephemeral: true });
                return;
            }

            const logChannel = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
            if (logChannel?.isTextBased()) {
                const logoutEmbed = new EmbedBuilder()
                    .setTitle('Bot Logging Off')
                    .setDescription('Bot commanded to log off by senseisanzu')
                    .setColor(0xff0000)
                    .setTimestamp();
                await logChannel.send({ embeds: [logoutEmbed] });
            }

            await interaction.reply('Shutting down...');
            process.exit(0);
            break;
        }
        case '8ball': {
            const responses = [
                "It is certain.",
                "Without a doubt.",
                "Yes – definitely.",
                "Ask again later.",
                "Cannot predict now.",
                "Don't count on it.",
                "My reply is no.",
                "Very doubtful.",
            ];
            const question = interaction.options.getString('question');
            const answer = responses[Math.floor(Math.random() * responses.length)];
            await interaction.reply(`🎱 **Question:** ${question}\n**Answer:** ${answer}`);
            break;
        }
        case 'fact': {
            const facts = [
                "Honey never spoils.",
                "Octopuses have three hearts.",
                "Bananas are berries, but strawberries aren't.",
                "Wombat poop is cube-shaped.",
                "Sharks are older than trees.",
                "A day on Venus is longer than a year on Venus.",
                "The Eiffel Tower can grow taller in summer.",
                "There’s enough DNA in your body to stretch from the sun to Pluto — and back — 17 times.",
                "The longest hiccuping spree lasted 68 years.",
                "Sloths can hold their breath longer than dolphins.",
                "Scotland’s national animal is the unicorn.",
                "Oxford University is older than the Aztec Empire.",
                "The dot over the letter 'i' is called a tittle.",
                "Koalas have fingerprints almost identical to humans.",
                "You can hear a blue whale’s heartbeat from two miles away.",
                "Cows have best friends and get stressed when separated.",
                "A bolt of lightning is five times hotter than the sun.",
                "There's a basketball court on the top floor of the U.S. Supreme Court — it's nicknamed 'the highest court in the land.'",
                "A single strand of spaghetti is called a spaghetto.",
                "Tigers have striped skin, not just striped fur.",
                "Some turtles can breathe through their butts.",
                "Nintendo was founded in 1889 — as a playing card company.",
                "Cats can't taste sweetness.",
                "Water can boil and freeze at the same time (it's called the triple point)."
            ];
            const fact = facts[Math.floor(Math.random() * facts.length)];
            await interaction.reply(`📚 **Fun Fact:** ${fact}`);
            break;
        }
        case 'animal': {
            const type = interaction.options.getString('type');

            const url = type === 'dog'
                ? 'https://api.thedogapi.com/v1/images/search'
                : 'https://api.thecatapi.com/v1/images/search';

            try {
                const response = await fetch(url);
                const data = await response.json();

                if (!data[0]?.url) {
                    await interaction.reply({ content: 'Failed to fetch image.', ephemeral: true });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle(`Here's a cute ${type}! 🐾`)
                    .setImage(data[0].url)
                    .setColor(ACCENT_COLOR)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error(`Error fetching ${type} image:`, error);
                await interaction.reply({ content: 'Error fetching image. Try again later.', ephemeral: true });
            }

            break;
        }
        case 'setannouncement': {
            const type = interaction.options.getString('type');
            const enable = interaction.options.getBoolean('enable');
            const channel = interaction.options.getChannel('channel');

            if (!['welcome', 'goodbye', 'boost'].includes(type)) {
                await interaction.reply({ content: 'Invalid announcement type.', ephemeral: true });
                return;
            }

            if (enable && !channel) {
                await interaction.reply({ content: 'You must specify a channel to enable this announcement.', ephemeral: true });
                return;
            }

            if (enable) {
                botData.announcements[`${type}Enabled`] = true;
                botData.announcements[`${type}ChannelId`] = channel.id;
            } else {
                botData.announcements[`${type}Enabled`] = false;
                botData.announcements[`${type}ChannelId`] = null;
            }
            saveBotData();

            await interaction.reply({ content: `Announcement for **${type}** has been ${enable ? 'enabled' : 'disabled'}.` });

            break;
        }
        case 'mail': {
            const channel = interaction.options.getChannel('channel');
            if (!channel?.isTextBased()) {
                await interaction.reply({ content: 'Invalid channel selected.', ephemeral: true });
                return;
            }

            // Show modal for message input
            const pingRole = interaction.options.getRole('pingrole');
            const modal = new ModalBuilder()
                .setCustomId(`mail-modal-${channel.id}_${pingRole?.id || 'none'}`)
                .setTitle('Send Mail')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('mailText')
                            .setLabel('Enter your announcement')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    )
                );

            await interaction.showModal(modal);
            break;
        }
        case 'rep': {
            const channel = interaction.options.getChannel('channel');
            const winner = interaction.options.getString('winner');
            const prize = interaction.options.getString('prize');
            const message = interaction.options.getString('message');
            const proof = interaction.options.getAttachment('proof');

            const embed = new EmbedBuilder()
                .setTitle('Event Result')
                .setDescription(`🎉 **Winner:** ${winner}\n🏆 **Prize:** ${prize}\n🔗 [Message Link](${message})`)
                .setImage(proof?.url)
                .setColor(ACCENT_COLOR)
                .setTimestamp();

            await channel.send({ embeds: [embed] });
            await interaction.reply({ content: 'Report posted successfully!', ephemeral: true });
            await logAction(`<@${interaction.user.id}> used /rep in <#${channel.id}>`);
            break;
        }
        case 'host': {
            const channel = interaction.options.getChannel('channel');
            const game = interaction.options.getString('game');
            const link = interaction.options.getString('link');
            const pingRole = interaction.options.getRole('pingrole');

            const embed = new EmbedBuilder()
                .setTitle(`🎮 Hosting: ${game}`)
                .setDescription(`Join the game here: ${link}`)
                .setColor(ACCENT_COLOR)
                .setTimestamp();

            const pingText = pingRole ? `<@&${pingRole.id}>` : '';

            await channel.send({ content: pingText, embeds: [embed] });
            await interaction.reply({ content: 'Event hosted successfully!', ephemeral: true });
            await logAction(`<@${interaction.user.id}> hosted an event in <#${channel.id}> for **${game}**`);
            break;
        }
    }
});

loadBotData();

client.login(CONFIG.TOKEN);

module.exports = {
    client,
    botData,
    CONFIG,
    saveBotData
};
