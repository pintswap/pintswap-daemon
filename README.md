# pintswap-daemon

PintSwap p2p node with REST API, hosted on NodeJS wrtc

## Usage

```sh
git clone https://github.com/pintswap/pintswap-daemon
cd pintswap-daemon
yarn
npm install -g
pintswap-daemon --rpc-host 127.0.0.1 --rpc-port 42161 --wallet 'just range effort spatial balance echo actor window remember unaware genre embrace uncover song gentle tower enable stumble forward economy library hen royal convince'
```
RPC bind address and port can also be set with environment variables PINTSWAP_DAEMON_HOST and PINTSWAP_DAEMON_PORT

Wallet can be mnemonic or private key format, and it can also be provided with environment variable PINTSWAP_DAEMON_WALLET

On first launch, a peer-id.json will be generated and stored in ~/.pintswap-daemon/peer-id.json

You can configure a different location and filename for the PeerId by setting PINTSWAP_PEERID_FILEPATH in your environment.

Orderbook data local to the daemon instance will be hosted at ~/.pintswap-daemon/data.json

You can configure a different location and filename for the database JSON by setting PINTSWAP_DATA_FILEPATH in your environment.

To run multiple daemon processes, you can either configure the aforementioned environment variables to ensure a unique PeerId and database, but it is simplest to run under different system users, only ensuring that you set a different PINTSWAP_DAEMON_PORT in the .bashrc for the given user.

To operate the daemon, it is possible to interact with the REST API provided using JSON inputs. It is also possible to simply use the pintswap-cli program also made available upon global install.

An invocation of pintswap-cli is in the following format:

```sh
pintswap-cli <command> --field1 value1 --field2 value2
```

A special command `pintswap-cli attach` exists which creates a WebSocket connection to the daemon and streams in logs emitted. In this fashion, you can get a handle to a stream of outputs from a daemon process forked into the background or otherwise run in systemd or Docker.

The pintswap-cli commands will call the corresponding `/command` endpoint on the hostname:port specified by the PINTSWAP_DAEMON_HOSTNAME and PINTSWAP_DAEMON_PORT set in the environment.

### REST API

To interact with the REST API, it is required to set the header `Content-Type: application/json` and send a JSON payload containing values for the fields specified below, or if no inputs are described, an empty object can be supplied.

### /peer

Retrieves the orderbook hosted by a remote peer on the PintSwap network, as well as any other details hosted by the peer, including the bio

Inputs:

```js
{
  "peer": "QmQ8e4HF8Vxw4Ep7mdQjvphZJwDhjLUAoXqmEzftZnyAK2"
}
```

A .drip name can be used in place of a multiaddr, if one is registered

```js
{
  "peer": "wock.drip"
}
```

```sh
pintswap-cli peer --peer wock.drip
```

### /peer-image

Pipes binary data to stdout containing the PNG image content for a PeerId profile picture. Should be redirected to a file. Inputs can be multiaddr or a .drip name.

Inputs:

```js
{
  "peer": "wock.drip"
}
```

```sh
pintswap-cli peer-image --peer wock.drip > ~/wock.png
```

### /add

Adds a limit order to the local orderbook. If the order exists on the daemon, it can be taken by anyone who dials the peer with the /trade function, whether or not the node is actively publishing. It only requires the multiaddr of the daemon to trade against it, or otherwise the .drip name registered, if there is one.

Inputs:

```js
{
  "getsToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "getsAmount": "0x102f40a4",
  "givesToken": "0x8d008CAC1a5CB08aC962b1e34E977B79ABEee88D",
  "givesAmount": "0x14c7ec8e56a7fc000000"
}
```

```sh
pintswap-cli add --gets-token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --gets-amount 0x102f40a4 --gives-token 0x8d008CAC1a5CB08aC962b1e34E977B79ABEee88D --gives-amount 0x14c7ec8e56a7fc000000
```

### /limit

Alternative syntax for the functionality in /add, which will adjust for a decimals() value automatically, so a floating point value can be used with the RPC for a price and amount.

Inputs:

```js
{
  "price": "0.00267",
  "amount": "100",
  "type": "sell",
  "pair": "0x8d008CAC1a5CB08aC962b1e34E977B79ABEee88D/USDC"
}
```

```sh
pintswap-cli limit --price 0.00267 --amount 100 --type sell --pair 0x8d008CAC1a5CB08aC962b1e34E977B79ABEee88D/USDC
```

### /offers

Retrives the local orders hosted on the daemon process which will be published if /publish is invoked.

```sh
pintswap-cli offers
```

### /delete

Deletes an order from the local orderbook hosted on the daemon process.

```js
{
   "id": "<orderhash>"
}
```

```sh
pintswap-cli delete --id 0xcd9305ed3975e3c0ad35f9169e75d386c63a21f4fa21433b2a97332336b39ad4
```

### /clear

Deletes the entire local orderbook hosted on the daemon process.

```sh
pintswap-cli clear
```

#### /publish

Begins publishing the orderbook local to the daemon. This must be called after the daemon initializes or your orders will not be visible on the public orderbook.

Example:

```sh
pintswap-cli publish
```

### /subscribe

Begins listening for orderbook publishes on the PintSwap network. Orders will accumulate and can thereafter be queried with the /orderbook route. If this API endpoint is not called after the daemon initializes the /orderbook route will respond with an empty list.

```sh
pintswap-cli subscribe
```

### /unsubscribe

Stops listening for orderbook publishes on the PintSwap network.

```sh
pintswap-cli unsubscribe
```

### /orderbook

Returns a view of the complete orderbook and associated PeerId for each offering.

```sh
pintswap-cli orderbook
```


### /trade

Attempts to negotiate a trade aggregating the complete set of orderid/amount pairs supplied, with the targeted peer. Supports the `broadcast: true` property which, if set, will attempt to execute the trade transacitons as a bundle using the flashbots relay API.

A /trade invocation can only execute if the base asset / trade asset pair are consistent throughout the list of orders to take, and they all must be offered by the same peer. This is true for any trade execution on the PintSwap protocol, whether it is by the daemon or the webapp that is being called to perform the trade.

Inputs:

```js
{
  "peer": "wock.drip",
  "trades": [{
    "offerHash": "0x44bdebb961a61ed9413fc1d950dad4cf9bf6410e4a95dbff7c2459bcc065ef6b",
    "amount": "0x20f5612972944a000000"
  }, {
    "offerHash": "0xcd9305ed3975e3c0ad35f9169e75d386c63a21f4fa21433b2a97332336b39ad4",
    "amount": "0x14c7ec8e56a7fc000000"
  }],
  "broadcast": true
}
```

```sh
pintswap-cli trade --peer wock.drip --trades 0x44bdebb961a61ed9413fc1d950dad4cf9bf6410e4a95dbff7c2459bcc065ef6b,0x20f5612972944a000000,0xcd9305ed3975e3c0ad35f9169e75d386c63a21f4fa21433b2a97332336b39ad4,0x14c7ec8e56a7fc000000 --broadcast
```


### /register

Registers a name on the .drip nameserver peers. Can only be unregistered with the PeerId used to register. Further work is planned to improve name resolution access control and mutability. For now, ensure you do not lose your PeerId if you intend to keep your .drip name.

Inputs:

```js
{
  "name": "wock.drip"
}
```

```sh
pintswap-cli register --name wock.drip
```

### /resolve

Resolves a `.drip` name to a multiaddr. Can also be used to do reverse lookups

Inputs:

```js
{
  "name": "wock.drip"
}
```

```sh
pintswap-cli resolve --name wock.drip
```

### /set-bio

Sets the bio associated with your daemon process, as visible on the webapp.

Inputs:

```js
{
  "bio": "fwm I always got it"
}
```

```sh
pintswap-cli set-bio --bio 'fwm I always got it'
```

### /set-image

Sets the profile picture associated with your daemon process, as visible on the webapp.

Inputs:

```js
{
  "image": "<base64 encoded PNG>"
}
```

```sh
pintswap-cli set-image --image ./wock.png
```

### ws://localhost:42161

Open a WebSocket connection to ws://<host>:<port> as specified by the environment to begin receiving logs in the form

```js
{
  "type": "log",
  "message": {
    "logLevel": "info"
    "timestamp": 1691183404902,
    "data": "initiating trade",
  }
}
```

```sh
pintswap-cli attach
```


## Author(s) (??)

Saying less ATM -- We wrote this on the run

Watch out for the snakes!! 💯
