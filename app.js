
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

let appName = path.basename(__filename);

// Global Variable to collect all info
let emailData = {}

// Config
var config = require(path.join(process.cwd(), '/config.json'));
if (typeof config.configFolder !== 'undefined' && typeof config.name !== 'undefined' &&
    fs.existsSync(path.join(config.configFolder, config.name, 'config.json'))) {
    let newConfig = JSON.parse(JSON.stringify(require(path.join(config.configFolder, config.name, 'config.json'))));
    config = Object.assign(config, newConfig)
    if (config.extendedLogging) console.log('Using config from: ' + path.join(config.configFolder, config.name, 'config.json'))
} else {
    if (config.extendedLogging) console.log('Could not find config in path: ' + path.join(config.configFolder, config.name, 'config.json. Using default.'))
}

// TLS unauthozied
if (typeof config.ignoreSSL !== 'undefined' && config.ignoreSSL) process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;


//===============================================================WINSTON START
const winston = require('winston');
require('winston-daily-rotate-file');

let myFormat = winston.format.printf(function (info) {
    return `[${info.timestamp}][${info.level.toUpperCase()}][${path.basename(__filename)}] ${info.message}`;
  });
  
let logger = winston.createLogger({
format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    myFormat
),
transports: [
    new winston.transports.Console({ colorize: true, handleExceptions: true }),
    new winston.transports.DailyRotateFile({
    filename: 'logs/WebServer_%DATE%.log',
    datePattern: 'DD-MM-YYYY',
    handleExceptions: true
    })
]
});
//===============================================================WINSTON END

// Commander CLI definition

const { Command } = require('commander');
const { exit } = require('process');
const program = new Command();
program.version('0.1.1')
.option('-d, --debug', 'Enables debugging messages and disables the actual delivery of messages.')
.option('-v, --verbose', 'Verbose mode. The details of delivery are displayed on the user\'s terminal.')
.option('-s, --subject <subject>', 'Specify subject on command line (only the first argument after the -s flag is used as a subject; be careful to quote subjects containing spaces).')
.option('-r, --from <from_addr>', 'Sets the From address. Overrides any from variable specified in config.json. This option exists for compatibility only; it is recommended to set the from variable in the config file instead.')
.option('-a, --attach <file_location>', 'Attach the given file to the message.')
.option('-b, --bcc <list>', 'Send blind carbon copies to list. list should be a comma-separated list of names.')
.option('-c, --cc <list>', 'Send carbon copies to a list of addresses. list should be a comma-separated list of names.')
.parse();

const options = program.opts();
if (options.debug) { 
    console.log(options);
    config.email.enabled = false
    config.extendedLogging = true
}

if (options.verbose) { 
    config.extendedLogging = true
}

if (options.subject) { 
    emailData.subject = options.subject
    if (config.extendedLogging) logger.info('Subject set to be: ' + options.subject )
}

if (options.cc) { 
    emailData.cc = options.cc
    if (config.extendedLogging) logger.info('CC set to be: ' + options.cc )
}

if (options.attach) { 
    logger.error('Attachment handling not yet defined.')
}

if (options.bcc) { 
    emailData.bcc = options.bcc
    if (config.extendedLogging) logger.info('BCC set to be: ' + options.bcc )
}

if (config.extendedLogging) logger.info('Remaining arguments: ', program.args.length);
if (program.args.length == 0) {
    logger.error('This version of the program requires 1 parameter defining the to-address')
    exit(1)
} else {
    emailData.to = program.args[0]
    if (config.extendedLogging) logger.info('TO set to be: ' + emailData.to )
}

// email Transporter
let emailTransporter 
if ((typeof config.email !== 'undefined') && (config.email.enabled)) {
  emailTransporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure, // true for 465, false for other ports
    auth: {
      user: config.email.auth.user, 
      pass: config.email.auth.pass, 
    },
  });
}


//Read STDIN
emailData.text = ""
process.stdin.on('readable', () => {
    let chunk;
    while ((chunk = process.stdin.read()) !== null) {
        if (chunk.toString().replace(/[^a-zA-Z]/g, "") === 'EOT') { 
            if (!emailData.sent) sendEmail()
            emailData.sent = true
            break
        }
        // logger.info(chunk)
        emailData.text += chunk
    }
});
process.stdin.on('end', function() {
    if (!emailData.sent) sendEmail()
    emailData.sent = true
});

// sendMail
async function sendEmail () {
    // all data should be already available in emailData. this function exists only to be async
    if (config.email.enabled) {
      try {
          let emailInfo = await emailTransporter.sendMail({
            from: config.email.from,
            to: emailData.to,
            subject: emailData.subject,
            cc: emailData.cc,
            bcc: emailData.bcc,
            text: emailData.text,
            html: emailData.text.replace(/\n/g,'<br>'),
            attachments: emailData.attachments,
          });
          if (config.extendedLogging) logger.info('Email info: '+ JSON.stringify(emailInfo))
      } catch(err) {
          logger.error('Unable to send email')
          logger.error(err)
      }
    } else logger.error('Email alert is disabled.')
}
