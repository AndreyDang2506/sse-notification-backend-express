const express = require('express');
const redis = require('redis');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const publisher = redis.createClient();
publisher.connect();
const subscriber = publisher.duplicate();
subscriber.connect();

subscriber.subscribe('notification', (content) => {
    const { username, from, message } = JSON.parse(content);
    console.log('subscriber message: ' + content)
    sendEventToUser(username, from, message);
})


async function subsribe(request, response, next) {
    const id = request.query.id;
    console.log(`user ${id} connected`);

    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };
    response.writeHead(200, headers);


    const newClient = {
        id,
        response
    };

    const offlineNotifications = await publisher.lRange(`offline_notifications:${id}`, 0, -1);
    setTimeout(() => {
        offlineNotifications.forEach((notification) => {
            const { username, from, message } = JSON.parse(notification);
            sendEventToUser(username, from, message);
        });
        publisher.del(`offline_notifications:${id}`);
    }, 1000)

    clients.push(newClient);

    request.on('close', () => {
        console.log(`${id} Connection closed`);
        clients = clients.filter(client => client.id !== id);
    });
}

function sendEventToUser(username, from, message) {
    console.info(`pushing ${message} notification for user ${username}`);
    const client = clients.filter(client => client.id === username);
    if (client.length) {
        console.log(`client ${client[0].id} sending...`)
        client[0].response.write(`data: ${JSON.stringify({ from, message })}\n\n`)
    }
}

async function send(request, respsonse, next) {
    const { from, message } = request.body;
    const { username } = request.params;
    const client = clients.filter(client => client.id === username);
    const msg = JSON.stringify({ username, from, message });
    // Check user's status and send notification if they are online
    if (client.length) {
        await publisher.publish('notification', msg);
    } else {
        // Store notifications in Redis to send back to users when they come back online
        await publisher.lPush(`offline_notifications:${username}`, msg)
    }
    respsonse.json('message pushed to user ' + username)
}

app.get('/status', (request, response) => response.json({ clients: clients.length }));
app.get('/subscription', subsribe);
app.post('/notification/:username', send);


const PORT = 8080;

let clients = [];

app.listen(PORT, () => {
    console.log(`Facts Events service listening at http://localhost:${PORT}`)
})
