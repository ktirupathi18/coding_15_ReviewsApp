const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const connectDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB-Error ${e.message}`);
    process.exit(1);
  }
};
connectDBAndServer();

//API-1

app.post("/register/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const bcryptPassword = await bcrypt.hash(password, 10);
  const getQuery = `
  SELECT * FROM user 
  WHERE username = '${username}'`;
  //console.log(getQuery);
  const userData = await db.get(getQuery);
  if (userData !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const updateQuery = `
      INSERT INTO user (username, name, password, gender) VALUES
      ('${username}', '${name}', '${bcryptPassword}', '${gender}')`;
      await db.run(updateQuery);
      response.send("User created successfully");
    }
  }
});

//API-2

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
      console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API-3
const convertObject = (object) => {
  return {
    username: object.username,
    tweet: object.tweet,
    dateTime: object.date_time,
  };
};
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getQuery = `
    SELECT tweet, date_time, username 
    FROM follower 
    INNER JOIN user
    ON user.user_id = follower.following_user_id 
    INNER JOIN tweet
    ON tweet.user_id = follower.following_user_id 
    WHERE follower.follower_user_id =
    (SELECT user_id from user WHERE user.username = '${username}') 
    ORDER BY date_time DESC
    LIMIT 4;`;
  const tweetsArray = await db.all(getQuery);
  console.log(getQuery);
  const convTweetsArray = tweetsArray.map(convertObject);
  response.send(convTweetsArray);
});

//API-4
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getQuery = `
    SELECT user.name 
    FROM user 
    INNER JOIN follower
    ON user.user_id = follower.following_user_id 
    WHERE follower.follower_user_id =
    (SELECT user_id from user WHERE user.username = '${username}');`;
  const namesList = await db.all(getQuery);
  response.send(namesList);
});

//API-5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getQuery = `
    SELECT user.name 
    FROM user 
    INNER JOIN follower
    ON user.user_id = follower.follower_user_id 
    WHERE follower.following_user_id =
    (SELECT user_id from user WHERE user.username = '${username}');`;
  const namesList = await db.all(getQuery);
  response.send(namesList);
});

//API-6
const convObject2 = (objects) => {
  return {
    tweet: objects.tweet,
    likes: objects.likes,
    replies: objects.replies,
    dateTime: objects.date_time,
  };
};
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const getQuery = `
    SELECT tweet, 
    (SELECT count(like_id) from like where like.tweet_id = tweet.tweet_id) as likes,
     (SELECT count(reply_id) from reply where reply.tweet_id = tweet.tweet_id) as replies,
      date_time 
    FROM tweet 
    INNER JOIN follower
    ON tweet.user_id = follower.following_user_id
    WHERE follower.follower_user_id =
    (SELECT user_id from user WHERE user.username = '${username}')
    AND tweet.tweet_id = ${tweetId}
    GROUP BY tweet.tweet_id ;`;
  const namesList = await db.get(getQuery);
  if (namesList === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const convList = convObject2(namesList);
    response.send(convList);
  }
});

//API-7
const convObj3 = (objects) => {
  let likesArray = [];
  let len = null;
  for (let item of objects) {
    len = likesArray.length;
    likesArray.splice(1, len - 1, item.username);
  }
  return {
    likes: likesArray,
  };
};
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getQuery = `
    SELECT username
    FROM user
    INNER JOIN like
    ON like.user_id = user.user_id
    INNER JOIN follower
    ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id =
    (SELECT user_id from user WHERE user.username = '${username}')
    AND like.tweet_id = ${tweetId};`;
    const usersList = await db.all(getQuery);
    if (usersList === undefined || usersList.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const convList = convObj3(usersList);
      response.send(convList);
    }
  }
);

//API-8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getQuery = `
    SELECT name, reply
    FROM user
    INNER JOIN reply
    ON reply.user_id = user.user_id
    INNER JOIN follower
    ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id =
    (SELECT user_id from user WHERE user.username = '${username}')
    AND reply.tweet_id = ${tweetId};`;
    const usersList = await db.all(getQuery);
    if (usersList === undefined || usersList.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      //const convList = convObj4(usersList);
      const finalList = {
        replies: usersList,
      };
      response.send(finalList);
    }
  }
);

//API-9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getQuery = `
    SELECT tweet, 
    (SELECT count(like_id) from like where like.tweet_id = tweet.tweet_id) as likes,
     (SELECT count(reply_id) from reply where reply.tweet_id = tweet.tweet_id) as replies,
      date_time 
    FROM tweet
    WHERE tweet.user_id =
    (SELECT user_id from user WHERE user.username = '${username}')
    GROUP BY tweet.tweet_id ;`;
  const namesList = await db.all(getQuery);
  if (namesList === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const convList = namesList.map(convObject2);
    response.send(convList);
  }
});

//API-10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;

  const getQue = `
  SELECT user_id from user WHERE username = '${username}'`;
  const value = await db.get(getQue);
  const addQuery = `
  INSERT INTO tweet (user_id, tweet) VALUES (${value.user_id}, '${tweet}')`;
  await db.run(addQuery);
  console.log(addQuery);
  response.send("Created a Tweet");
});
module.exports = app;

//API-11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const getQue = `
        SELECT user_id from user WHERE username = '${username}';`;
    const value = await db.get(getQue);
    const findQue = `
        SELECT * FROM tweet WHERE tweet_id = ${tweetId} AND user_id = ${value.user_id}`;
    const foundList = await db.get(findQue);
    if (foundList === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else if (foundList.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const delQuery = `
        DELETE FROM tweet WHERE user_id = ${value.user_id}
        AND tweet_id = ${tweetId};`;
      await db.run(delQuery);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
