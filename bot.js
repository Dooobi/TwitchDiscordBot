const tmi = require('tmi.js');
const Discord = require('discord.js');
const discordCharWidth = require('./discordCharWidth.json');
const axios = require('axios');

const twitchChannels = {
    'demindh': null,
    'zfg1': null,
    'mystakin': null,
    'singsing': null,
    'bububu': null,
    'gamesdonequick': null,
    'aurateur': null,
};
const discordConfig = {
    botToken: 'Nzk1NjkxMzM0Njg2MDgxMDI2.X_NDTQ.hvNaIMMhp7ugAQvuwyz0xpoj4dE'
};
const twitchConfig = {
    options: {
        clientId: 'bexg0bqowt89t9h88247lwh4s9xnd5',
        debug: false
    },
    connection: {
        reconnect: true
    },
    identity: {
        username: 'demindhbot',
        password: 'oauth:w2j0x40ra00c2nfayv2k44fendwphp',
    },
    channels: Object.keys(twitchChannels)
};

// State variables
const usernameWidth = 150;  // width to use for the username in Discord (in pixels)
var discordEmotes = {};

// Connecting to Discord
const discordClient = new Discord.Client();
discordClient.login(discordConfig.botToken);

// Connecting to Twitch
const twitchClient = new tmi.client(twitchConfig);
twitchClient.connect();

// Check state of Twitch channels immediately and then in intervals
refreshTwitchChannelInfos(Object.keys(twitchChannels))
    .then(() => {
        setInterval(() => refreshTwitchChannelInfos(Object.keys(twitchChannels)), 30 * 1000);
    });

// Log messages in queue
var previousCountRemainingMessages = 0;
setInterval(() => {
    var countRemainingMessages = discordClient.rest.handlers.reduce((sum, handler) => sum + handler.queue.remaining, 0);
    if (countRemainingMessages > 0 || countRemainingMessages !== previousCountRemainingMessages) {
        log('Discord', `Messages in queue: ${countRemainingMessages}`);
    }
    previousCountRemainingMessages = countRemainingMessages;
}, 3000);

// Register Discord event handlers
discordClient.on('ready', () => {
    log('Discord', `Logged in as ${discordClient.user.tag}!`);

    refreshDiscordEmotes();
    setInterval(refreshDiscordEmotes, 30 * 1000);
    // discordClient.channels.fetch('632876156093464576')
    //     .then(channel => {
    //         log('Discord', `Fetched channel: ${channel}`);
    //         channel.send(`<:zfgDampePls:795762227906609162>`);
    //         // var poop = '\u{1F4A9}';
    //         // for (var i = 0; i <= 255; i++) {
    //         //     var char = String.fromCharCode(i);
    //         // }
    //     });
    // discordClient.channels.fetch('796113028848156694')
    //     .then(channel => {
    //         log('Discord', `Fetched channel: ${channel}`);
    //         channel.send(`Hallo, das ist ein Test <:hes_Smug_3:629347837431513088> <:zfgDampePls:795762227906609162>. hehe`);
    //         // var poop = '\u{1F4A9}';
    //         // for (var i = 0; i <= 255; i++) {
    //         //     var char = String.fromCharCode(i);
    //         // }
    //     });
});
discordClient.on('message', discordMessage => {
    if (discordMessage.author.bot) return;

    var botUserId = discordClient.user.id;
    var botMention = discordMessage.mentions.users.find(user => user.id === botUserId) || discordMessage.mentions.roles.find(role => role.name === 'DemindhBot');
    if (botMention) {
        var response = discordMessage.content.replace(`<@!${botMention.id}>`, '').replace(`<@&${botMention.id}>`, '');
        discordMessage.reply(replaceEmotes(response));
    }
    var channelName = discordMessage.channel.name;
    if (twitchChannels[channelName]) {
        twitchClient.say(channelName, discordMessage.content);
    }
    // discordMessage.reply(discordMessage);
});

// Register Twitch event handlers
twitchClient.on('message', (channel, context, twitchMessage, self) => {
    try {
        const twitchChannel = channel.substring(1);
        const twitchDisplayName = context['display-name'];
        const twitchChannelInfo = twitchChannels[twitchChannel];
        // const twitchUsername = context['username'];

        if (twitchChannelInfo
            && !twitchChannelInfo.is_live
            ) {
            var discordChannels = [];

            discordClient.guilds.cache.forEach(guild => {
                var discordChannel = guild.channels.cache.find(channel => channel.name === twitchChannel && channel.parent && channel.parent.name === 'Twitch');
                if (discordChannel) {
                    discordChannels.push(discordChannel);
                }
            });

            if (discordChannels.length > 0) {
                var discordMessage = replaceEmotes(twitchMessage);
                var discordUsername = escapeMarkdownChars(adjustStringToWidth(twitchDisplayName, usernameWidth));

                discordChannels.forEach(discordChannel => {
                    discordChannel.send(`**${discordUsername}**:  ${discordMessage}`);
                });
            }
        }
    } catch (ex) {
        log('Twitch', `${ex}`);
    }
});
twitchClient.on('connected', (addr, port) => {
    log('Twitch', `Connected to ${addr}:${port}`);
});

function escapeMarkdownChars(str) {
    var newString = [];
    for (var i = 0; i < str.length; i++) {
        var char = str[i];
        if (char === '_') {
            newString.push('\\');
        }
        newString.push(char);
    }
    return newString.join('');
}

function adjustStringToWidth(str, totalWidth) {
    var newString = [];
    var currentWidth = 0;
    var distCurrent = Math.abs(totalWidth - currentWidth);
    var blankChar = String.fromCharCode(0x202F);
    var blankWidth = discordCharWidth['0x202F'] || 3;

    for (var i = 0; i < str.length; i++) {
        var char = str[i];
        var width = discordCharWidth[char] || 17;   // Chinese characters are 17px wide
        var distNew = distCurrent - width;

        if (distNew <= 0) {
            if (Math.abs(distNew) <= Math.abs(distCurrent)) {
                newString.push(char);
                distCurrent = distNew;
            }
            break;
        }
        newString.push(char);
        distCurrent = distNew;
    }
    if (distCurrent >= blankWidth) {
        var countBlankChars = Math.round(distCurrent / blankWidth);
        newString.unshift(blankChar.repeat(countBlankChars));
    }

    return newString.join('');
}

function replaceEmotes(message) {
    var newMessage = [];
    var messageParts = message.split(' ');

    for (var messagePart of messageParts) {
        var fixedMessagePart = null;
        
        switch (messagePart) {
            case 'D:':
                fixedMessagePart = 'D_';
                break;
            default:
                fixedMessagePart = messagePart.replace(/^:|:$/g, '');
        }
        
        var discordEmote = discordEmotes[fixedMessagePart];
        if (discordEmote) {
            newMessage.push(discordEmote);
        } else {
            newMessage.push(messagePart);
        }
    }

    return newMessage.join(' ');
}

function addColonsForEmotes(message, twitchContext) {
    var newMessage = message;
    var indexes = [];
    for (var emoteId in twitchContext.emotes) {
        var occurrences = twitchContext.emotes[emoteId];
        for (var occurrence of occurrences) {
            indexes = indexes.concat(occurrence.split('-').map(index => parseInt(index)));
            indexes[indexes.length - 1] += 1;
        }
    }
    indexes.sort((i1, i2) => i2 - i1);
    indexes.forEach(index => newMessage = newMessage.substring(0, index) + ':' + newMessage.substring(index));
    return newMessage;
}

function getTwitchChannelInfo(channelName) {
    return axios.get(`https://api.twitch.tv/helix/search/channels?query=${channelName}`, {
        headers: {
            'client-id': twitchConfig.options.clientId,
            'Authorization': `Bearer tfj27kcl9eehz99s2ic4l36vmrt8jw`
        }
    })
        .then(response => {
            var channel = response.data.data.find(data => data.display_name === channelName);

            return Promise.resolve(channel);
        });
}

function refreshTwitchChannelInfos(channelNames) {
    return Promise.all(channelNames.map(channel => getTwitchChannelInfo(channel)))
        .then(responses => {
            for (var i = 0; i < channelNames.length; i++) {
                var twitchChannelName = channelNames[i];
                var twitchChannelInfo = responses[i];
                var previousTwitchChannelInfo = twitchChannels[twitchChannelName];

                if (!twitchChannelInfo) {
                    twitchChannelInfo = {};
                }
                if (previousTwitchChannelInfo === null || previousTwitchChannelInfo.is_live !== twitchChannelInfo.is_live) {
                    log('Twitch', `${twitchChannelName} is ${twitchChannelInfo.is_live ? 'live!' : 'not live.'}`);
                }

                twitchChannels[twitchChannelName] = twitchChannelInfo;
            }
        });
}

function refreshDiscordEmotes() {
    discordEmotes = {};
    discordClient.guilds.cache.forEach(guild => {
        guild.emojis.cache.forEach(emote => {
            discordEmotes[emote.name] = emote;
        });
    });
}

function log(name, message) {
    var maxNameLength = 0;
    var longestName = 0;

    if (name.length > longestName.length) {
        longestName = name.length;
        maxNameLength = longestName + 2;
    }
    var tag = `[${name}]`.padEnd(maxNameLength);
    console.log(`${tag} (${new Date().toLocaleTimeString('de-DE')}) ${message}`);
}