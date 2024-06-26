import express from 'express';
import path from 'path';
import WebSocket from 'ws';
import { getIDfromWS, encaspulateMessageJSON, decaspulateMessageJSON } from './websocketUtils';
import { connect } from './dbUtils';

import dotenv from 'dotenv';

dotenv.config();


const app = express();

const valid_ids = ["1","2","3","100", "101", "102"];

const reserved_ids = ["0"];

var decap: { userId: string, message: string } = { userId: "", message: "" };


const is_valid_userId = (userId: string): boolean => {
    return valid_ids.includes(userId);
};

const is_reserved_userId = (userId: string): boolean => {
    return reserved_ids.includes(userId);
};

const clients = new Map<string | undefined, WebSocket>();

const platformReseverdClients = new Set<WebSocket>();

//WebServer
// app.listen(3000, () => {
//     console.log('WebAPI -> http://localhost:3000');
// });

// app.get('/', (req, res) => {
//     const clientList = Array.from(clients).map(ws => ws[0]);
//     res.json(clientList);
// });

//Websocket
const server = app.listen(8080, () => {
    console.log('WS -> http://localhost:8080');
    console.log('DB URL-> '+process.env.DATABASE_URL);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', async (ws, req) => {
    req.rawHeaders.forEach(element => {
        console.log(element);
    });
    let db = connect();
    (await db).execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    const userId = getIDfromWS(req);
    console.log(userId)
    if (userId && is_valid_userId(userId)) {
        clients.set(userId, ws);
    }
    else if (userId && is_reserved_userId(userId)) {
        platformReseverdClients.add(ws);
    }
    else {
        ws.send("DEBUG: Invalid ID" + userId);
        ws.close();
    }

    ws.on('close', () => {
        clients.delete(userId);
    });

    ws.on('message', async (message: string) => {
        console.log("%s", message);
        //CLIENT TO PLATFORM
        if (userId && is_valid_userId(userId))
            platformReseverdClients.forEach((client) => {
                client.send(encaspulateMessageJSON(userId, message));
            });
        else {
            //PLATORM TO CLIENT
            decap = decaspulateMessageJSON(message.toString());
            clients.get(decap.userId)?.send(JSON.stringify(decap.message));
            platformReseverdClients.forEach((client) => {
                if (client !== ws)
                {
                     client.send(encaspulateMessageJSON(decap.userId, JSON.stringify(decap.message)));
                }
            }
            );
        }

        const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
        (await db).execute(
            `INSERT INTO messages (userId, createdAt, message) VALUES (?, ?, ?)`,
            [userId, timestamp, message]
            ).then((result) => {
                console.log(`Inserted message for userId=${userId}`);
            }).catch((err) => {
                console.error(err);
            });

    });
});


module.exports = app;