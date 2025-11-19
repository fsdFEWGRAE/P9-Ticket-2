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


// =======================
//      RENDER PORT
// =======================
const app = express();
app.get("/", (req, res) => res.send("P9 Ticket Bot is running!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));


// =======================
//       CLIENT
// =======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});


// =======================
//    GLOBAL CONSTANTS
// =======================
const PREFIX = "#";

const STAFF_ROLE_ID = "1438169628571471982";
const LOG_CHANNEL_ID = "1438169861619585076";

const PANEL_CHANNEL_ID = "1440508751412203570"; // ← غرفة اللوحة (لا تُحذف أبداً)

const CATEGORY_IDS = {
  support: "1438169784213831691",
  "hwid-reset": "1438179752220426240",
  purchase: "1438182132400001227",
  media: "1438182084765028432"
};


// =======================
//   DATA STORAGE
// =======================
const ticketOwners = new Map(); // channelId → ownerId
const ticketClaims = new Map(); // channelId → staffId


// =======================
//  PANEL SETTINGS JSON
// =======================
const SETTINGS_FILE = "panel_settings.json";

let panelSettingsDefault = {
  title: "نظام التذاكر — Ticket System",
  description:
    "الرجاء فتح تذكرة لأي استفسار أو مشكلة / Please submit a ticket for any question or concern.\n\n" +
    "لا تفتح أكثر من تذكرة واحدة / Do not open multiple tickets.\n\n" +
    "اكتب مشكلتك بالتفصيل مع الصور إن وجدت / Explain your issue clearly with screenshots if possible.\n\n" +
    "التعاون مطلوب لضمان سرعة الخدمة / Cooperation is required to help us serve you faster.\n\n" +
    "سنقدم لك أفضل مساعدة ممكنة بإذن الله / We will provide the best support possible.\n",
  image: "🔗 ضع رابط صورة اللوحة هنا"
};

let panelSettings = panelSettingsDefault;

if (fs.existsSync(SETTINGS_FILE)) {
  try {
    panelSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    panelSettings = panelSettingsDefault;
  }
} else {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(panelSettingsDefault, null, 2));
}

function savePanelSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(panelSettings, null, 2));
}


// =======================
//     HELPER FUNCTIONS
// =======================
function userOpenTicketCount(user) {
  let count = 0;

  ticketOwners.forEach((ownerId) => {
    if (ownerId === user.id) count++;
  });

  return count;
}

function createTicketButtons(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel("Claim")
      .setStyle(ButtonStyle.Success)
      .setDisabled(claimed),

    new ButtonBuilder()
      .setCustomId("ticket_unclaim")
      .setLabel("Unclaim")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!claimed),

    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
  );
}


// =======================
//         READY
// =======================
client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});


// =======================
//    MESSAGE COMMANDS
// =======================
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();


  // -----------------------------------------
  //           PANEL COMMANDS
  // -----------------------------------------
  if (command === "panel") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("❌ تحتاج صلاحيات Administrator.");

    const sub = args.shift()?.toLowerCase();

    if (!sub)
      return message.reply(
        "الاستخدام: #panel set_title <title> | set_description <desc> | set_image <url> | show"
      );

    if (sub === "set_title") {
      panelSettings.title = args.join(" ");
      savePanelSettings();
      return message.reply("✔ تم تغيير عنوان اللوحة.");
    }

    if (sub === "set_description") {
      panelSettings.description = args.join(" ");
      savePanelSettings();
      return message.reply("✔ تم تغيير وصف اللوحة.");
    }

    if (sub === "set_image") {
      panelSettings.image = args[0];
      savePanelSettings();
      return message.reply("✔ تم تغيير صورة اللوحة.");
    }

    if (sub === "show") {
      const embed = new EmbedBuilder()
        .setTitle(panelSettings.title)
        .setDescription(panelSettings.description)
        .setColor("#36fff8")
        .setImage(panelSettings.image);

      const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_type_select")
        .setPlaceholder("اختر نوع التذكرة / Choose your ticket type")
        .addOptions(
          { label: "Support", value: "support" },
          { label: "HWID Reset", value: "hwid-reset" },
          { label: "Purchase", value: "purchase" },
          { label: "Media", value: "media" }
        );

      return message.channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)]
      });
    }
  }


  // -----------------------------------------
  //         #TICKET
  // -----------------------------------------
  if (command === "ticket") {
    const embed = new EmbedBuilder()
      .setTitle(panelSettings.title)
      .setDescription(panelSettings.description)
      .setColor("#36fff8")
      .setImage(panelSettings.image);

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_type_select")
      .setPlaceholder("اختر نوع التذكرة / Choose your ticket type")
      .addOptions(
        { label: "Support", value: "support" },
        { label: "HWID Reset", value: "hwid-reset" },
        { label: "Purchase", value: "purchase" },
        { label: "Media", value: "media" }
      );

    return message.channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }


  // -----------------------------------------
  //         #CLOSEALL (Final Fix)
  // -----------------------------------------
  if (command === "closeall") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("❌ هذا الأمر للمديرين فقط.");

    let closed = 0;

    message.guild.channels.cache.forEach(async (ch) => {

      // ❗ لا تحذف غرفة اللوحة نهائياً
      if (ch.id === PANEL_CHANNEL_ID) return;

      // ❗ احذف فقط قنوات التذاكر التي تحتوي userId
      if (
        ch.type === ChannelType.GuildText &&
        ch.name.includes("-ticket-") &&
        /\d{17,19}/.test(ch.name) // userId داخل الاسم
      ) {
        try {
          await ch.delete();
          closed++;
        } catch {}
      }
    });

    ticketOwners.clear();
    ticketClaims.clear();

    return message.reply(`✅ تم إغلاق جميع التذاكر (${closed}) بنجاح — بدون حذف لوحة التذاكر.`);
  }
});


// =======================
//    SELECT MENU → MODAL
// =======================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "ticket_type_select") return;

  if (userOpenTicketCount(interaction.user) >= 1) {
    return interaction.reply({
      content: "❌ لديك تذكرة مفتوحة مسبقًا.",
      ephemeral: true
    });
  }

  const type = interaction.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`ticket_reason:${type}`)
    .setTitle("سبب فتح التذكرة / Ticket Reason");

  const input = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("اشرح مشكلتك / Explain your issue")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  await interaction.showModal(modal);
});


// =======================
//       CREATE TICKET
// =======================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("ticket_reason:")) return;

  const type = interaction.customId.split(":")[1];
  const reason = interaction.fields.getTextInputValue("reason");
  const guild = interaction.guild;
  const user = interaction.user;

  const categoryId = CATEGORY_IDS[type];
  const channelName = `${type}-ticket-${user.id}`.toLowerCase();

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] },
      { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] }
    ]
  });

  ticketOwners.set(channel.id, user.id);

  const embed = new EmbedBuilder()
    .setTitle("New Ticket Created")
    .setDescription(`**نوع التذكرة:** ${type}\n**الســبب:** ${reason}`)
    .setColor("#36fff8")
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() });

  const row = createTicketButtons(false);

  await channel.send({
    content: `مرحبا ${user}! سيتم خدمتك قريبًا.\nHello ${user}! Staff will assist you shortly.`,
    embeds: [embed],
    components: [row]
  });

  await interaction.reply({
    content: `✔ تم إنشاء التذكرة: ${channel}`,
    ephemeral: true
  });
});


// =======================
//  CLAIM / UNCLAIM / CLOSE
// =======================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, channel, user, guild, member } = interaction;

  // ------------------------
  //         CLAIM
  // ------------------------
  if (customId === "ticket_claim") {
    if (ticketClaims.get(channel.id))
      return interaction.reply({ content: "❌ التذكرة مستلمة بالفعل.", ephemeral: true });

    ticketClaims.set(channel.id, user.id);

    await channel.edit({
      name: `${channel.name}-claimed-by-${user.id}`
    });

    await channel.send(`🏷️ تم استلام التذكرة بواسطة ${user}.`);

    return interaction.update({ components: [createTicketButtons(true)] });
  }


  // ------------------------
  //        UNCLAIM
  // ------------------------
  if (customId === "ticket_unclaim") {
    const claimer = ticketClaims.get(channel.id);

    if (claimer !== user.id)
      return interaction.reply({ content: "❌ فقط الشخص الذي استلم التذكرة يمكنه إلغاء الاستلام.", ephemeral: true });

    ticketClaims.delete(channel.id);

    await channel.edit({
      name: channel.name.split("-claimed-by-")[0]
    });

    await channel.send("❌ تم فك استلام التذكرة.");

    return interaction.update({ components: [createTicketButtons(false)] });
  }


  // ------------------------
  //         CLOSE
  // ------------------------
  if (customId === "ticket_close") {
    const ownerId = ticketOwners.get(channel.id);
    const isOwner = ownerId === user.id;
    const isStaff = member.roles.cache.has(STAFF_ROLE_ID);

    if (!isOwner && !isStaff)
      return interaction.reply({
        content: "❌ لا يمكنك إغلاق هذه التذكرة.",
        ephemeral: true
      });

    await interaction.deferReply({ ephemeral: true });

    await channel.delete();

    ticketOwners.delete(channel.id);
    ticketClaims.delete(channel.id);

    return interaction.editReply({ content: "✔ تم إغلاق التذكرة.", ephemeral: true });
  }
});


// =======================
//         LOGIN
// =======================
client.login(process.env.TOKEN);
