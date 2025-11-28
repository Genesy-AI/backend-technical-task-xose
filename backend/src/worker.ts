import 'dotenv/config'
import { NativeConnection, Worker } from '@temporalio/worker'
import * as activities from './workflows/activities'

export async function runTemporalWorker() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || '',
  })
  try {
    const worker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'myQueue',
      workflowsPath: require.resolve('./workflows'),
      activities,
    })

    await worker.run()
  } finally {
    await connection.close()
  }
}
