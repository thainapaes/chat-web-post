var express = require("express");
var app = express();
var server = require("http").createServer(app);
var bodyParser = require("body-parser");

app.use(bodyParser.json());

var io = require("socket.io")(server);

var port = process.env.PORT || 3000;

var users = [];

var users2 = {};

var channels = ["general"];

var channels2 = {};
newChannel({ name: "general" })

var socketsByUsername = {};
var numUsers = 0;

const PAGE_SIZE = 20;

server.listen(port, function() {
  console.log("Server listening at port %d", port);
});

// Routing
app.use(express.static("./src/client/"));

// Get all the current users in json
app.get("/users", function(req, res) {
  res.send(users);
});

// Get all channels available in json
app.get("/channels", function(req, res) {
  res.send(channels);
});

// Route used to check whether username is available
app.get("/users/available", function(req, res) {
  const username = req.query.username;
  // Check if username is available
  res.send({ isAvailable: !socketsByUsername.hasOwnProperty(username) });
});

/// nova

app.get("/v1/users", function(req, res) {
  res.send(Object.values(users2));
});

app.post("/v1/join", function(req, res) {
  const username = req.body.username;

  console.log("Added user " + username);

  if (!users2[username]) {
    users2[username] = { username };
    ++numUsers;
  }

  res.send({ users: Object.values(users2), numUsers });
});

app.post("/v1/left", function(req, res) {
  const username = req.body.username;

  console.log("Left user " + username);

  if (users2[username]) {
    delete users2[username];
    --numUsers;
  }

  res.send({ users: Object.values(users2), numUsers });
});

app.get("/v1/channels", function(req, res) {
  res.send(
    Object.values(channels2).map(c => ({
      ...c,
      messages: c.messages.slice(0, 2)
    }))
  );
});

app.post("/v1/channels", function(req, res) {
  const name = req.body.name;

  res.send(newChannel({ name }));
});

app.get("/v1/channels/:channel", function(req, res) {
  const channel = req.params.channel;
  let next = req.query.next || 0;
  next = parseInt(next, 10);

  if (channels2[channel]) {
    res.send(channels2[channel].messages.slice(next, next + PAGE_SIZE));
  } else {
    res.send([]);
  }
});

app.post("/v1/channels/:channel", function(req, res) {
  const channel = req.params.channel;
  const text = req.body.text;
  const sender = req.body.sender;
  const all = req.body.all;

  if (channels2[channel]) {
    channels2[channel].messages.unshift({ username: sender, text, all });
    res.send({ username: sender, text, all });
  } else {
    res.send({});
  }
});

// Chatroom
function deleteUserWithUsername(username) {
  for (var i = 0; i < users.length; i++) {
    if (users[i].name === username) {
      console.log("found removing user " + username);
      // Remove from array
      users.splice(i, 1);
      break;
    }
  }
}

function userForUsername(username) {
  for (var i = 0; i < users.length; i++) {
    if (users[i].name == username) {
      return users[i];
    }
  }

  return false;
}

// Removes user from server by deleting from users and socket collection
function removeUserForSocket(socket) {
  deleteUserWithUsername(socket.username);
  delete socketsByUsername[socket.username];
  --numUsers;
}

io.on("connection", function(socket) {
  var addedUser = false;

  // when the client emits 'new message', this listens and executes
  socket.on("new message", function(data) {
    console.log("New message channel:" + data.channel);
    // TODO Improve security by implemented broadcasting to specific rooms
    // tell the client to execute 'new message'
    socket.broadcast.emit("new message", {
      user: { name: socket.username },
      message: data.message,
      createdAt: new Date(),
      channel: data.channel
    });
  });

  // when the client emits 'add user', this listens and executes
  socket.on("add user", function(username) {
    if (addedUser) return;
    console.log("Added user " + username);

    // we store the username in the socket session for this client
    socket.username = username;
    // Add to users list

    socketsByUsername[socket.username] = socket;
    if (!userForUsername(username)) {
      users.push({ name: username });
      ++numUsers;
      addedUser = true;
      socket.emit("login", { numUsers: numUsers });
      // echo globally (all clients) that a person has connected
      socket.broadcast.emit("user joined", {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });

  // when the user disconnects.. perform this
  socket.on("disconnect", function() {
    if (addedUser) {
      removeUserForSocket(socket);
    }
  });
});

function newChannel({ name }) {
  const c = {
    name,
    messages: []
  };

  channels2[name] = c;
  return c;
}
