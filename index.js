import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

import fs from "fs";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

// ================ Web Server لـ Render ================
const app = express();
app.get("/", (req, res) => {
  res.send("P9 Ticket Bot is running!");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ================ إعداد البوت ================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

const PREFIX = "#";
const MAX_OPEN_TICKETS_PER_USER = 1;

// IDs من عندك
const STAFF_ROLE_ID = "1438169628571471982";
const LOG_CHANNEL_ID = "1438169861619585076";

const CATEGORY_IDS = {
  support: "1438169784213831691",
  "hwid-reset": "1438179752220426240",
  purchase: "1438182132400001227",
  media: "1438182084765028432"
};

// تخزين صاحب التذكرة + الشخص اللي Claim
const ticketOwners = new Map(); // channelId -> userId
const ticketClaims = new Map(); // channelId -> staffId

// ================ panel_settings.json ================
const SETTINGS_FILE = "panel_settings.json";

let panelSettingsDefault = {
  title:
    "Please submit a ticket for any questions or concerns you may have. You can also use the ticket system to purchase any of Vela's Products. We appreciate your interest and look forward to helping you!",
  description:
    "Do Not Open Multiple Tickets.\n\nList Your Issue Carefully With All Details, Screenshots, And Anything To Help Us Fix It Quicker & Easier.\n\nCorporation Is 100% Required, Failure To Do So We Will Simply Not Help You, Please Make This Is easier for both of us.\n\nPlease Be Kind & Have Respect As We Will Do The Same!\n\n----- Payment options -----\n\n• (Crypto, LTC, BTC ,ETH\n• (Credit/Debit Cards)\n• (PayPal, Friends & Family)\n• (Apple Pay))",
  image: "https://your-image-link-here/TICKET_P9.png"
};

let panelSettings = panelSettingsDefault;

if (fs.existsSync(SETTINGS_FILE)) {
  try {
    panelSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch (e) {
    console.error("Error reading panel_settings.json, using default.");
  }
} else {
  fs.writeFileSync(
    SETTINGS_FILE,
    JSON.stringify(panelSettingsDefault, null, 2)
  );
}

function savePanelSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(panelSettings, null, 2));
}

// ================ Buttons helper ================
function createTicketButtons(claimed) {
  const claimBtn = new ButtonBuilder()
    .setCustomId("ticket_claim")
    .setLabel("Claim")
    .setStyle(ButtonStyle.Success)
    .setDisabled(claimed);

  const unclaimBtn = new ButtonBuilder()
    .setCustomId("ticket_unclaim")
    .setLabel("Unclaim")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!claimed);

  const closeBtn = new ButtonBuilder()
    .setCustomId("ticket_close")
    .setLabel("Close")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(claimBtn, unclaimBtn, closeBtn);
}

// حساب عدد التذاكر المفتوحة للمستخدم
function userOpenTicketCount(guild, user) {
  let count = 0;
  guild.channels.cache.forEach((ch) => {
    if (
      ch.type === ChannelType.GuildText &&
      ch.name.toLowerCase().includes("ticket") &&
      ch.permissionsFor(user)?.has(PermissionsBitField.Flags.ViewChannel)
    ) {
      count++;
    }
  });
  return count;
}

// ================ Ready ================
client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ================ أوامر الكتابة ================
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  // ===== panel أوامر =====
  if (command === "panel") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return message.reply("You must be an administrator to use panel.");
    }

    const sub = args.shift()?.toLowerCase();

    if (!sub) {
      return message.reply(
        "Usage: #panel set_title <title> | set_description <desc> | set_image <url> | show"
      );
    }

    if (sub === "set_title") {
      const title = args.join(" ");
      if (!title) return message.reply("Please provide a title.");
      panelSettings.title = title;
      savePanelSettings();
      return message.reply("Panel title updated ✅");
    }

    if (sub === "set_description") {
      const desc = args.join(" ");
      if (!desc) return message.reply("Please provide a description.");
      panelSettings.description = desc;
      savePanelSettings();
      return message.reply("Panel description updated ✅");
    }

    if (sub === "set_image") {
      const url = args[0];
      if (!url) return message.reply("Please provide an image URL.");
      panelSettings.image = url;
      savePanelSettings();
      return message.reply("Panel image updated ✅");
    }

    if (sub === "show") {
      const embed = new EmbedBuilder()
        .setTitle(panelSettings.title)
        .setDescription(panelSettings.description)
        .setColor("#36fff8")
        .setImage(panelSettings.image);

      // قائمة أنواع التذكرة تحت الـ Embed
      const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_type_select")
        .setPlaceholder("Choose your ticket type...")
        .addOptions(
          {
            label: "Support",
            description: "Get support from staff",
            value: "support"
          },
          {
            label: "HWID Reset",
            description: "Request a HWID reset",
            value: "hwid-reset"
          },
          {
            label: "Purchase",
            description: "purchase a product",
            value: "purchase"
          },
          {
            label: "Media",
            description: "apply for media",
            value: "media"
          }
        );

      const row = new ActionRowBuilder().addComponents(menu);

      return message.channel.send({ embeds: [embed], components: [row] });
    }

    return;
  }

  // ===== أمر ticket (نفس panel show بس للريجيولر) =====
  if (command === "ticket") {
    const embed = new EmbedBuilder()
      .setTitle(panelSettings.title)
      .setDescription(panelSettings.description)
      .setColor("#36fff8")
      .setImage(panelSettings.image);

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_type_select")
      .setPlaceholder("Choose your ticket type...")
      .addOptions(
        {
          label: "Support",
          description: "Get support from staff",
          value: "support"
        },
        {
          label: "HWID Reset",
          description: "Request a HWID reset",
          value: "hwid-reset"
        },
        {
          label: "Purchase",
          description: "purchase a product",
          value: "purchase"
        },
        {
          label: "Media",
          description: "apply for media",
          value: "media"
        }
      );

    const row = new ActionRowBuilder().addComponents(menu);

    return message.channel.send({ embeds: [embed], components: [row] });
  }

  // ===== أوامر الدفع (اختياري) =====
  if (command === "applepay") {
    return message.reply(
      "**Apple Pay Payment Info:**\nSend payment to: `your-applepay-address-or-email`"
    );
  }

  if (command === "crypto") {
    return message.reply(
      "**Crypto Payment Info:**\nBTC: `your-btc-address`\nLTC: `your-ltc-address`\nETH: `your-eth-address`"
    );
  }
});

// ================ اختيار نوع التذكرة (Select Menu) ================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "ticket_type_select") return;

  const ticketType = interaction.values[0];
  const guild = interaction.guild;
  const user = interaction.user;

  // تحقق من عدد التذاكر المفتوحة
  if (userOpenTicketCount(guild, user) >= MAX_OPEN_TICKETS_PER_USER) {
    return interaction.reply({
      content: `You already have the maximum number of open tickets (${MAX_OPEN_TICKETS_PER_USER}). Please close your existing ticket first.`,
      ephemeral: true
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`ticket_reason:${ticketType}`)
    .setTitle("Ticket Reason");

  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Describe your issue or request")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(reasonInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
});

// ================ استقبال الـ Modal وإنشاء التذكرة ================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("ticket_reason:")) return;

  const ticketType = interaction.customId.split(":")[1];
  const reason = interaction.fields.getTextInputValue("reason");
  const guild = interaction.guild;
  const user = interaction.user;

  const categoryId = CATEGORY_IDS[ticketType];
  const category = guild.channels.cache.get(categoryId);

  if (!category) {
    return interaction.reply({
      content: "Category not found. Please contact an admin.",
      ephemeral: true
    });
  }

  try {
   const channelName = `${ticketType}-ticket-${user.id}`.toLowerCase();

    const channel = await guild.channels.create({
      name: channelName.slice(0, 90),
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        {
          id: STAFF_ROLE_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]
    });

    ticketOwners.set(channel.id, user.id);

    const embed = new EmbedBuilder()
      .setTitle("New Ticket Created")
      .setDescription(
        `**Ticket type:** ${ticketType.replace("-", " ").toUpperCase()}\n**Reason:** ${reason}`
      )
      .setColor("#36fff8")
      .setFooter({ text: `User ID: ${user.id}` })
      .setAuthor({
        name: user.tag,
        iconURL: user.displayAvatarURL()
      });

    const row = createTicketButtons(false);

    await channel.send({
      content: `Hello ${user}, <@&${STAFF_ROLE_ID}> will be with you shortly.`,
      embeds: [embed],
      components: [row]
    });

    await interaction.reply({
      content: `Your ticket has been created: ${channel}`,
      ephemeral: true
    });
  } catch (err) {
    console.error("Error creating ticket:", err);
    await interaction.reply({
      content: "Error creating ticket. Please contact an admin.",
      ephemeral: true
    });
  }
});

// ================ Claim / Unclaim / Close Buttons ================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, channel, user, guild, member } = interaction;

  // ==== Claim ====
  if (customId === "ticket_claim") {
    const existing = ticketClaims.get(channel.id);
    if (existing) {
      return interaction.reply({
        content: `This ticket is already claimed by <@${existing}>.`,
        ephemeral: true
      });
    }

    ticketClaims.set(channel.id, user.id);

    // إعادة تسمية القناة
    let newName = channel.name.split("-claimed-by-")[0];
    newName = `${newName}-claimed-by-${user.username}`.toLowerCase();
    if (newName.length > 90) newName = newName.slice(0, 90);
    await channel.edit({ name: newName });

    await channel.send(`🏷️ This ticket has been claimed by ${user}.`);

    const row = createTicketButtons(true);
    return interaction.update({ components: [row] });
  }

  // ==== Unclaim ====
  if (customId === "ticket_unclaim") {
    const claimerId = ticketClaims.get(channel.id);
    if (!claimerId || claimerId !== user.id) {
      return interaction.reply({
        content: "Only the staff member who claimed this ticket can unclaim it.",
        ephemeral: true
      });
    }

    ticketClaims.delete(channel.id);

    const baseName = channel.name.split("-claimed-by-")[0];
    await channel.edit({ name: baseName });

    await channel.send("❌ This ticket is no longer claimed.");

    const row = createTicketButtons(false);
    return interaction.update({ components: [row] });
  }

  // ==== Close (مع Transcript) ====
  if (customId === "ticket_close") {
    const ownerId = ticketOwners.get(channel.id);
    const isOwner = ownerId === user.id;
    const isStaff =
      member.roles.cache.has(STAFF_ROLE_ID) ||
      member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (!isOwner && !isStaff) {
      return interaction.reply({
        content: "Only staff or the ticket creator can close this ticket.",
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // جلب جميع الرسائل
    async function fetchAllMessages(ch) {
      let all = [];
      let lastId;
      while (true) {
        const fetched = await ch.messages.fetch({
          limit: 100,
          before: lastId
        });
        if (fetched.size === 0) break;
        all = all.concat(Array.from(fetched.values()));
        lastId = fetched.last().id;
      }
      return all.reverse();
    }

    const messages = await fetchAllMessages(channel);

    const openedAt =
      messages.length > 0 ? messages[0].createdTimestamp : channel.createdTimestamp;
    const closedAt = Date.now();
    const openedDate = new Date(openedAt);
    const closedDate = new Date(closedAt);

    const creatorMention = ownerId ? `<@${ownerId}>` : "Unknown";
    const closerMention = user.toString();
    const messageCount = messages.length;

    // Embed معلومات التذكرة
    const infoEmbed = new EmbedBuilder()
      .setTitle("Ticket Closed")
      .setColor("#36fff8")
      .addFields(
        {
          name: "Opened",
          value: openedDate.toISOString().replace("T", " ").split(".")[0] + " UTC",
          inline: true
        },
        {
          name: "Closed",
          value: closedDate.toISOString().replace("T", " ").split(".")[0] + " UTC",
          inline: true
        },
        { name: "Creator", value: creatorMention, inline: false },
        { name: "Closed by", value: closerMention, inline: false },
        { name: "Messages", value: String(messageCount), inline: false }
      );

    await channel.send({ embeds: [infoEmbed] });

    // إعداد HTML Transcript
    const userSet = new Set(
      messages.map((m) => `${m.author.tag} (${m.author.id})`)
    );
    const userList = Array.from(userSet).sort();

    let html = [];
    html.push(
      "<html><head><meta charset='utf-8'><title>Ticket Transcript</title>"
    );
    html.push("<style>");
    html.push(
      "body{background-color:#36393f;color:#dcddde;font-family:'Segoe UI','Arial',sans-serif;margin:0;padding:0;}"
    );
    html.push(
      ".container{max-width:800px;margin:40px auto;padding:20px;background:#2f3136;border-radius:8px;box-shadow:0 2px 10px #0004;}"
    );
    html.push(
      ".msg{margin-bottom:18px;padding:12px 16px;background:#40444b;border-radius:6px;display:flex;align-items:flex-start;gap:12px;cursor:pointer;transition:background .2s;}"
    );
    html.push(".msg:hover{background:#50545c;}");
    html.push(".author{color:#7289da;font-weight:bold;}");
    html.push(".timestamp{color:#b9bbbe;font-size:12px;margin-right:8px;}");
    html.push(".attachment{color:#43b581;font-size:13px;}");
    html.push(".type-bot{color:#faa61a;font-size:12px;margin-left:8px;}");
    html.push(".type-user{color:#43b581;font-size:12px;margin-left:8px;}");
    html.push(".type-system{color:#f04747;font-size:12px;margin-left:8px;}");
    html.push(
      ".copy-btn{background:#23272a;color:#fff;border:none;border-radius:4px;padding:2px 8px;margin-left:8px;cursor:pointer;font-size:12px;}"
    );
    html.push(".copy-btn:hover{background:#7289da;}");
    html.push(
      ".jump-btn{position:fixed;bottom:30px;right:30px;background:#7289da;color:#fff;border:none;border-radius:50%;width:48px;height:48px;font-size:24px;cursor:pointer;box-shadow:0 2px 10px #0004;z-index:100;}"
    );
    html.push(
      ".search-bar{position:sticky;top:0;background:#23272a;padding:16px 0 8px 0;z-index:10;}"
    );
    html.push(
      ".search-input,.user-filter{width:100%;padding:8px 12px;border-radius:4px;border:none;background:#40444b;color:#fff;font-size:16px;margin-bottom:8px;}"
    );
    html.push(".user-filter{margin-top:8px;}");
    html.push(".details{display:none;margin-top:8px;}");
    html.push(".msg.expanded .details{display:block;}");
    html.push("hr{border:none;border-top:1px solid #23272a;margin:24px 0;}");
    html.push("h2,p{color:#fff;}");
    html.push("</style>");
    html.push("<script>");
    html.push("function filterMessages(){");
    html.push("var input=document.getElementById('searchInput');");
    html.push("var filter=input.value.toLowerCase();");
    html.push("var user=document.getElementById('userFilter').value;");
    html.push("var msgs=document.getElementsByClassName('msg');");
    html.push("for(var i=0;i<msgs.length;i++){");
    html.push("var text=msgs[i].innerText.toLowerCase();");
    html.push(
      "var userMatch=user===''||msgs[i].getAttribute('data-user')===user;"
    );
    html.push(
      "msgs[i].style.display=(text.includes(filter)&&userMatch)?'flex':'none';"
    );
    html.push("}}");
    html.push("function toggleDetails(idx){");
    html.push("var msg=document.getElementById('msg-'+idx);");
    html.push(
      "if(msg.classList.contains('expanded')){msg.classList.remove('expanded');}"
    );
    html.push("else{msg.classList.add('expanded');}}");
    html.push("function copyContent(idx){");
    html.push(
      "var content=document.getElementById('content-'+idx).innerText;navigator.clipboard.writeText(content);alert('Message copied!');}"
    );
    html.push("function jumpToBottom(){window.scrollTo(0,document.body.scrollHeight);}");
    html.push("</script></head><body>");
    html.push("<div class='container'>");
    html.push("<div class='search-bar'>");
    html.push(
      "<input id='searchInput' class='search-input' type='text' placeholder='Search messages...' onkeyup='filterMessages()'>"
    );
    html.push(
      "<select id='userFilter' class='user-filter' onchange='filterMessages()'>"
    );
    html.push("<option value=''>Filter by user</option>");
    for (const u of userList) {
      html.push(`<option value="${u}">${u}</option>`);
    }
    html.push("</select></div>");
    html.push(`<h2>Transcript for #${channel.name}</h2>`);
    html.push(
      `<p>Closed at: ${closedDate
        .toISOString()
        .replace("T", " ")
        .split(".")[0]} UTC</p>`
    );
    html.push("<hr>");

    messages.forEach((msg, idx) => {
      const time = new Date(msg.createdTimestamp)
        .toISOString()
        .replace("T", " ")
        .split(".")[0];
      const author = `${msg.author.tag} (${msg.author.id})`;
      const avatarUrl = msg.author.displayAvatarURL();
      const content = (msg.content || "").replace(/\n/g, "<br>");

      let mtype = "<span class='type-user'>(user)</span>";
      if (msg.author.bot) mtype = "<span class='type-bot'>(bot)</span>";

      html.push(
        `<div class='msg' id='msg-${idx}' data-user='${author}' onclick='toggleDetails(${idx})'>`
      );
      html.push(
        `<img src='${avatarUrl}' alt='avatar' width='40' height='40' style='border-radius:50%;margin-right:10px;'>`
      );
      html.push("<div>");
      html.push(
        `<span class='timestamp'>[${time}]</span> <span class='author'>${author}:</span> ${mtype} `
      );
      html.push(`<span id='content-${idx}'>${content}</span>`);
      html.push(
        `<button class='copy-btn' onclick='event.stopPropagation();copyContent(${idx});'>Copy</button>`
      );
      html.push("<div class='details'>");

      if (msg.attachments.size > 0) {
        msg.attachments.forEach((att) => {
          const fn = att.name;
          const url = att.url;
          const isImg = att.contentType?.startsWith("image/");
          if (isImg) {
            html.push(
              `<br><span class="attachment">Attachment:</span> <a href="${url}">${fn}</a><br><img src="${url}" alt="${fn}" style="max-width:200px;max-height:200px;border-radius:8px;margin-top:4px;">`
            );
          } else {
            html.push(
              `<br><span class="attachment">Attachment:</span> <a href="${url}">${fn}</a>`
            );
          }
        });
      }

      if (msg.reactions.cache.size > 0) {
        html.push('<div style="margin-top:6px;">');
        msg.reactions.cache.forEach((reaction) => {
          const emoji = reaction.emoji.toString();
          const count = reaction.count;
          html.push(
            `<span style="margin-right:8px;font-size:18px;">${emoji} <span style="color:#b9bbbe;font-size:14px;">${count}</span></span>`
          );
        });
        html.push("</div>");
      }

      html.push("</div></div></div>");
    });

    html.push(
      "<button class='jump-btn' onclick='jumpToBottom()' title='Jump to bottom'>&#8595;</button>"
    );
    html.push("</div></body></html>");

    const transcript = html.join("\n");
    const safeName = channel.name.replace(/[^a-z0-9\-]/gi, "_");
    const filename = `transcript-${safeName}-${Date.now()}.html`;

    fs.writeFileSync(filename, transcript, "utf8");

    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);

    if (logChannel) {
      await logChannel.send({ embeds: [infoEmbed] });
      await logChannel.send({
        content: `Transcript for ${channel.name} closed by ${user}`,
        files: [filename]
      });
    }

    // إرسال في الخاص لصاحب التذكرة
    if (ownerId) {
      try {
        const ownerUser = await guild.client.users.fetch(ownerId);
        await ownerUser.send({
          content: "Here is the transcript for your closed ticket:",
          files: [filename]
        });
      } catch (e) {
        // تجاهل فشل الرسائل الخاصة
      }
    }

    ticketOwners.delete(channel.id);
    ticketClaims.delete(channel.id);

    await channel.delete().catch(() => {});
    fs.unlinkSync(filename);

    await interaction.editReply({
      content: "Ticket closed and transcript generated ✅",
      ephemeral: true
    });
  }
});

// ================ تشغيل البوت ================
client.login(process.env.TOKEN);


