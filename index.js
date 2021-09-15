require("dotenv").config()
const ccxt = require("ccxt")

const exchangeArgs = {
	apiKey: process.env.exchangeApiKey,
	secret: process.env.exchangeApiSecret,
	timeout: 60000,
	enableRateLimit: true,
}

const exchange = new ccxt.binance(exchangeArgs)
const tradingPair = process.env.tradingPair

validate()
async function validate() {
	// Validate exchange API Keys
	try {
		await exchange.fetchBalance()
		console.log ('API has been approved')
	} catch(e) {
		return console.log('Invalid API', exchange.iso8601 (Date.now ()), e.constructor.name, e.message)
	}

	// Validate trading pair
	try {
		await exchange.fetchTicker(tradingPair)
		console.log(`${tradingPair} is a valid trading pair`)
		start()
	} catch (e) {
		return console.log('Invalid trading pair', exchange.iso8601 (Date.now ()), e.constructor.name, e.message)
	}
}

async function start() {
	// Get % change of trading pair over last 24 hours
	let fetchTicker = await exchange.fetchTicker(tradingPair)
	let actualChange24hr = fetchTicker.percentage
	let targetChange24hr = parseInt(process.env.percentageChangeTarget)

	// Check if actual % change over 24 hours is greater than the target
	if (actualChange24hr <= targetChange24hr) {
		// If the target is met and the desired dip happened, place a market order then wait for a specified amount of hours before restarting
		await buy(fetchTicker)
		console.log(`Waiting ${process.env.hrsBetweenOrders} hours before checking again`)
		await sleep(process.env.hrsBetweenOrders*1000*60*60)
		start()
	} else {
		// If the target isn't met, check again every 5 minutes
		console.log('Target not met, checking again in 5 minutes')
		await sleep(5*1000*60)
		start()
	}
}

// Place market order of specified USD value for specified trading pair
async function buy(fetchTicker) {
	let balance = await exchange.fetchBalance()
	let dollarBalance

	let crypto = tradingPair.split('/')[0]
	let stableCoin = tradingPair.split('/')[1]

	if (stableCoin === 'USDT') {
		dollarBalance = balance.USDT.free
	} else if (stableCoin === 'USDC') {
		dollarBalance = balance.USDC.free
	} else if (stableCoin === 'USD') {
		dollarBalance = balance.USD.free
	} else {
		return console.log('Trading pair must contain some form of USD stable coin')
	}

	let quantity = process.env.amountToBuyUSD/fetchTicker.last

	// If the wallet doesn't have enough stable coin to complete the order, set the quantity to 95% of whatever's available
	if (fetchTicker.last*quantity > dollarBalance) {
		quantity = Math.floor(dollarBalance*.95/fetchTicker.last)
		console.log(`Not enough ${stableCoin} in your wallet to buy $${process.env.amountToBuyUSD} of ${crypto}. New amount is $${quantity*fetchTicker.last}`)
	}

	console.log(`Would buy ${quantity} ${crypto} here`)
	return

	// Placing the order needs testing
	try {
		if (exchange.has['createMarketOrder']) {
			let buy = await exchange.createOrder (tradingPair, 'market', 'buy', quantity);
			console.log (`Bought ${buy.amount} ${crypto} at $${buy.price} per coin for a total of $${buy.cost} at ${buy.datetime}`);
		} else {
			let buy = await exchange.createOrder (tradingPair, 'limit', 'buy', quantity, fetchTicker.last*1.05);
			console.log (`Bought ${buy.info.original_amount} ${crypto} at ~$${buy.info.avg_execution_price}`);
		}
	} catch (e) {
		return console.log ('Failed buying', exchange.iso8601 (Date.now ()), e.constructor.name, e.message)
	}
}

// Helper function to sleep for t milliseconds
const sleep = (t) => ({ then: (r) => setTimeout(r, t) })