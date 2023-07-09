## TPOC

A POC for transfering USDT to employee as salary on testnet (Sepolia) with 2 API endpoints
- GET `/transfers/{transferId}` - to get transfer information by transfer ID
- POST `/transfers` - to create transfer

### How it works
- there's a wallet (address: `0x887d9882081d0CA6983CAcED3EF5F492746319c6`) where the funds will be transferred from
- on calling the create transfer endpoint, it will validate inputs and try to get the employee's wallet address information from the database
- after that it will insert the transfer information into a `transfer` table and return the ID as response
- in the meantime, the transfer request will be queued into a SQS and being processed sequentially. The handler will check if wallet balance is sufficient
- if sufficient fund it will create a transfer on the blockchain, else it'll mark the transfer as `INSUFFICIENT_BALANCE`
- after creating the transaction, the transfer will be queue into another SQS queue with delay of 1 min. The handler of the next queue will check check if the transaction is mined and confirmed and update the database accordingly

### API endpoints
This project is deployed to AWS, hence the API endpoints is accessbile via ` https://w60bnpkg5f.execute-api.ap-southeast-1.amazonaws.com/production/<API path>`

#### Create transfer
- endpoint -> POST `/transfers`
- body:

| field           | description  | required? |
|-----------------|--------------|-----------|
| employeeId      | ID of employee for paying salary. Please refer to the `sampleData.sql` file for some sample ID and wallet address   | YES |
| amount          | amount in USDT, must be positive number  | YES  |
| idempotencyKey  | idempotency key, must be unique  | YES  |

sample request:

```
{
	"employeeId": "6959b156-8232-4f36-afc0-c18a6815c3c5",
	"amount": 20000,
	"idempotencyKey": "a07fc317-906a-47cf-9328-c357ffca6cd6"
}
```

sample response:
```
{
	"transferId": "bf20fdc6-602e-4582-a36d-ededad735452"
}
```

#### Get transfer
- endpoint -> GET `/transfers/{transferId}`

sample response:
```
{
	"id": "bf20fdc6-602e-4582-a36d-ededad735452",
	"destination_address": "0x45C71BFfa3fF3440B298201086f59ECFDE5b02B2",
	"transaction_hash": null,
	"amount": "20000000000",
	"status": "INSUFFICIENT_BALANCE",
	"employee_id": "6959b156-8232-4f36-afc0-c18a6815c3c5",
	"created_at": "2023-07-09T11:45:37.294Z"
}
```

### Note
- The database schema and data inserted into the database can be found in `sampleData.sql`
- The postgresQL used for this project is hosted with ElephantSQL under free tier, hence there's a limit of storage (20mb) and database connection (5)
- The contract address used for testing USDT on Sepolia testnet is `0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`
- The wallet address for transferring out fund was funded with ~1000 USDT
