const bcrypt = require("bcrypt");
const express = require("express");
const jsonwebtoken = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

dbPath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());
db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () =>
      console.log("Server started at http://localhost:3000/")
    );
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

/**Authenticator(MiddleWareFunction) Step-3*/
const authenticator = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401); /**401-ClientSide Error */
    response.send("Invalid JWT Token");
  } else {
    jsonwebtoken.verify(jwtToken, "SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401); /**401-ClientSide Error */
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

/**API-1 Register */
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  /*Verify user Step-1*/
  const searchUser = `select * from user where username= "${username}";`;
  const data = await db.get(searchUser);

  if (data === undefined && password.length >= 6) {
    const createUser = `insert into user (username, password, name, gender) 
            values('${username}', "${hashedPassword}", '${name}',"${gender}");`;

    await db.run(createUser);
    response.send("User created successfully");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

/**API-2 Login Step-2*/
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  /*Verify user*/
  const searchUser = `select * from user where username= "${username}";`;
  const data = await db.get(searchUser);

  if (data === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPassMatch = await bcrypt.compare(password, data.password);
    if (isPassMatch === true) {
      /**Creating JWT Token */

      payload = { username: username };
      jwtToken = await jsonwebtoken.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

/** API-3 Returns the latest tweets of people whom the user follows. Return 4 tweets at a time */
app.get("/user/tweets/feed/", authenticator, async (request, response) => {
  let { username } = request;

  const userQuery = `select * from user where username= "${username}";`;
  const user = await db.get(userQuery);
  const user_id1 = user.user_id;

  const getTweetsQuery = `
    select user.username as username, tweet.tweet as tweet, tweet.date_time as dateTime
    from (user 
    inner join follower on user.user_id = follower.following_user_id) as T
    inner join tweet on tweet.user_id = T.following_user_id
    where T.follower_user_id= ${user_id1}
    order by 
    strftime("Y",date_time), 
    strftime("m",date_time),
    strftime("d",date_time),
    strftime("H",date_time),
    strftime("M",date_time),
    strftime("S",date_time),
    user.username asc;`;

  const getTweets = await db.all(getTweetsQuery);

  response.send(getTweets);
});

/** API-4 Returns the list of all names of people whom the user follows */
app.get("/user/following/", authenticator, async (request, response) => {
  let { username } = request;

  const userQuery = `select * from user where username= "${username}";`;
  const user = await db.get(userQuery);
  const user_id1 = user.user_id;

  const getHeFollowsQuery = `
   SELECT
      user.name
   FROM    
      user
   INNER JOIN follower ON user.user_id = follower.following_user_id
WHERE
  follower.follower_user_id = ${user_id1};`;

  getHeFollows = await db.all(getHeFollowsQuery);
  response.send(getHeFollows);
});

/** API-5 Returns the list of all names of people his followers */
app.get("/user/followers/", authenticator, async (request, response) => {
  let { username } = request;

  const userQuery = `select * from user where username= "${username}";`;
  const user = await db.get(userQuery);
  const user_id1 = user.user_id;

  const getHeFollowsQuery = `
   SELECT
      user.name
   FROM    
      user
   INNER JOIN follower ON user.user_id = follower.follower_user_id
WHERE
  follower.following_user_id = ${user_id1};`;

  const getHeFollows = await db.all(getHeFollowsQuery);
  response.send(getHeFollows);
});

/** API-6 Get tweet of whom he is following */
app.get("/tweets/:tweetId/", authenticator, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;

  const userQuery = `select * from user where username= "${username}";`;
  const user = await db.get(userQuery);
  const user_id1 = user.user_id;

  const getHeFollowsQuery = `
    SELECT
      *
   FROM    
      user
   INNER JOIN follower ON user.user_id = follower.following_user_id
WHERE
  follower.follower_user_id = ${user_id1};`;

  const checkFollowing = await db.all(getHeFollowsQuery);

  let whomHeFollows = [];
  checkFollowing.forEach((each) => {
    whomHeFollows.push(each.user_id);
  });

  const selectUserQuery = `select user_id from tweet where tweet_id = ${tweetId};`;

  const res = await db.get(selectUserQuery);
  const theUserIdBasedOnGivenTwitterId = res.user_id;

  if (whomHeFollows.includes(theUserIdBasedOnGivenTwitterId)) {
    const getData = ` select tweet.tweet, count(distinct like.like_id) as likes, count(distinct reply.reply_id) as replies, tweet.date_time as dateTime 
      from tweet
        inner join reply on tweet.tweet_id = reply.tweet_id 
        inner join like on reply.tweet_id = like.tweet_id
        where tweet.tweet_id= ${tweetId}`;
    const tweet = await db.get(getData);
    response.send(tweet);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

/** API-7 Get tweets-likes of whom he is following */
app.get("/tweets/:tweetId/likes/", authenticator, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;

  const userQuery = `select * from user where username= "${username}";`;
  const user = await db.get(userQuery);
  const user_id1 = user.user_id;

  const getHeFollowsQuery = `
    SELECT
      *
   FROM    
      user
   INNER JOIN follower ON user.user_id = follower.following_user_id
WHERE
  follower.follower_user_id = ${user_id1};`;

  const checkFollowing = await db.all(getHeFollowsQuery);

  let whomHeFollows = [];
  checkFollowing.forEach((each) => {
    whomHeFollows.push(each.user_id);
  });

  const selectUserQuery = `select user_id from tweet where tweet_id = ${tweetId};`;
  const res = await db.get(selectUserQuery);
  const theUserIdBasedOnGivenTwitterId = res.user_id;

  if (!whomHeFollows.includes(theUserIdBasedOnGivenTwitterId)) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getData = ` select user.username
      from tweet
        inner join like on tweet.tweet_id = like.tweet_id 
        inner join user on user.user_id = like.user_id
        where tweet.tweet_id= ${tweetId};`;
    const usernames = await db.all(getData);
    let userList = [];
    usernames.forEach((each) => {
      userList.push(each.username);
    });
    response.send({ likes: userList });
  }
});

/**API-8 GET get all user-tweet replies whom he follows*/
app.get(
  "/tweets/:tweetId/replies/",
  authenticator,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;

    const userQuery = `select * from user where username= "${username}";`;
    const user = await db.get(userQuery);
    const user_id1 = user.user_id;

    const getHeFollowsQuery = `
    SELECT
      *
   FROM    
      user
   INNER JOIN follower ON user.user_id = follower.following_user_id
WHERE
  follower.follower_user_id = ${user_id1};`;

    const checkFollowing = await db.all(getHeFollowsQuery);

    let whomHeFollows = [];
    checkFollowing.forEach((each) => {
      whomHeFollows.push(each.user_id);
    });

    const selectUserQuery = `select user_id from tweet where tweet_id = ${tweetId};`;
    const res = await db.get(selectUserQuery);
    const theUserIdBasedOnGivenTwitterId = res.user_id;

    if (!whomHeFollows.includes(theUserIdBasedOnGivenTwitterId)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getData = ` select user.name,reply.reply
      from tweet
        inner join reply on tweet.tweet_id = reply.tweet_id 
        inner join user on user.user_id = reply.user_id
        where tweet.tweet_id= ${tweetId};`;
      const usernames = await db.all(getData);

      response.send({ replies: usernames });
    }
  }
);

/**API - 9 GET  get list of tweets of a user*/
app.get("/user/tweets/", authenticator, async (request, response) => {
  const { username } = request;

  const userQuery = `select * from user where username= "${username}";`;
  const user = await db.get(userQuery);
  const user_id1 = user.user_id;

  const getData = `
      select tweet.tweet, count(distinct like.like_id) as likes, count(distinct reply.reply_id) as replies, tweet.date_time as dateTime 
      from tweet
        inner join reply on tweet.tweet_id = reply.tweet_id 
        inner join like on tweet.tweet_id = like.tweet_id
        where tweet.user_id= ${user_id1}
        group by tweet.tweet_id;
    `;
  const data = await db.all(getData);
  response.send(data);
});

/**API - 10 POST  Create a Tweet*/
app.post("/user/tweets/", authenticator, async (request, response) => {
  const { tweet } = request.body;

  const createTweetQuery = `
    insert into tweet (tweet) 
    values ("${tweet}");`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

/**API-11 DELETE*/
app.delete("/tweets/:tweetId/", authenticator, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;

  const userQuery = `select * from user where username= "${username}";`;
  const user = await db.get(userQuery);
  const user_id1 = user.user_id;

  const tweetQuery = `select * from tweet where tweet_id= ${tweetId};`;
  const getTweet = await db.get(tweetQuery);
  const user_id2 = getTweet.user_id;

  if (user_id1 === user_id2) {
    const deleteQuery = `
  DELETE  FROM 
     tweet
  WHERE
    tweet_id = ${tweetId}
  `;
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
module.exports = app;
