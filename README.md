# Warehouse Stock Transfers

Group 8, Introduction to Cloud Computing, The British University in Egypt.

A web app for moving stock between warehouses: staff request a transfer, a manager approves it,
then the goods are dispatched and their arrival is confirmed. Stock levels update at every step.

## Team

| Member | Part |
|---|---|
| Ziyad Mohamed | Inventory service |
| Mostafa Hossam Mostafa | Transfers service |
| Saif | Tracking service |

## Links

**App pages (deployed on Floci):**

| Page | Link | Who |
|---|---|---|
| Inventory (start here) | <http://localhost:4566/inventory-frontend/inventory.html> | everyone |
| Transfers | <http://localhost:4566/transfers-frontend/transfers.html> | everyone |
| Approvals | <http://localhost:4566/transfers-frontend/approvals.html> | managers |
| Tracking | <http://localhost:4566/tracking-frontend/tracking.html> | everyone |

**APIs (API Gateway + Lambda), health checks:**

| Service | Link |
|---|---|
| Inventory | <http://localhost:4566/_aws/execute-api/5c6f7e04b4/$default/api/health> |
| Transfers | <http://localhost:4566/_aws/execute-api/40239bc039/$default/api/health> |
| Tracking | <http://localhost:4566/_aws/execute-api/55f7de1800/$default/api/health> |

Each one should show `{"status":"ok","environment":"production"}`. These API ids are from our
deployment; on another PC, use the addresses that the `infra/deploy-*.sh` scripts print.

**Floci:**

| What | Link |
|---|---|
| Floci console (like the AWS Console) | <http://localhost:4566/_floci/ui> |
| Floci status | <http://localhost:4566/_floci/health> |

**Local development** (only while `npm run dev` is running):

| What | Link |
|---|---|
| Pages | <http://localhost:8080/inventory.html> |
| Inventory API | <http://localhost:3001/api/health> |
| Transfers API | <http://localhost:3002/api/health> |
| Tracking API | <http://localhost:3003/api/health> |

**GitHub:** <https://github.com/Ziyad167/warehouse-stock-transfers-group>

## How to use the system

Open the Inventory page, choose your role (**Manager** or **Staff**) and log in. The menu at the top
takes you to each page.

- **Inventory:** choose a warehouse to see its items and stock. Add or remove units. Check if a
  warehouse can send a quantity, and search where an item is.
  Managers can also add, edit and delete warehouses and items, and they see low-stock alerts here.
- **Transfers:** request a transfer (from warehouse, to warehouse, item, quantity). Follow each request
  through its steps: Requested, Approved, Dispatched, Received. You can cancel your own request while
  it is still waiting.
- **Approvals** (managers only): approve a waiting request if the source has enough stock, or reject
  it with a reason.
- **Tracking:** dispatch an approved transfer (the units leave the source warehouse). Confirm the receipt
  when it arrives (the units are added to the destination; if some are missing, write a note).
  See the movement history and the shipment messages.

## What we use

- **Backend:** Node.js 24 and Express 5: three services (Inventory, Transfers, Tracking)
- **Frontend:** HTML, CSS and JavaScript
- **Cloud (on Floci, a local AWS in Docker):**
  - AWS Lambda and API Gateway: run the three services
  - DynamoDB: stores the data
  - S3: hosts the pages
  - IAM: one limited role per service
  - SNS and SQS: low-stock alerts and shipment messages
  - CloudWatch Logs: the services' logs
- **Tools:** Git and GitHub, VS Code (REST Client for the API tests), Docker