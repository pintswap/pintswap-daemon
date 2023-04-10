# pintswap-daemon

PintSwap market maker process with REST API

## Usage

Set the environment variable PINTSWAP_DAEMON_WALLET to the private key that holds the assets to trade.

Optionally, configure the PINTSWAP_DAEMON_HOSTNAME and PINTSWAP_DAEMON_PORT variables; otherwise, the service will be bound to 127.0.0.1:42161 (shout out for the ARB/Arbitrum squad for the blessing this year)

Run the process with `yarn start`

## CLI Usage

This package can be installed globally to consume the REST API via CLI

```sh

npm install -g
pintswap-cli offers
pintswap-cli add --get-token ETH --gives-token USDC --get-amount 0.01 --gives-amount 5
pintswap-cli delete --id <orderhash>
```


## Author(s) (??)

Saying less ATM -- We wrote this on the run

Watch out for the snakes!! 💯
