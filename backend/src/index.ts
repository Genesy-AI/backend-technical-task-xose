import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { Connection, Client } from '@temporalio/client'
import { verifyEmailWorkflow, findPhoneWorkflow } from './workflows'
import { generateMessageFromTemplate } from './utils/messageGenerator'
import { runTemporalWorker } from './worker'
import { Server as SocketServer } from 'socket.io'
import http from 'http'
import pLimit from 'p-limit'

const prisma = new PrismaClient()
const app = express()
const server = http.createServer(app)
const io = new SocketServer(server, { cors: { origin: '*' } })

// Configure WebSocket
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)
})

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || ''

app.use(express.json())

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
    return
  }

  next()
})

app.post('/leads', async (req: Request, res: Response) => {
  const { name, lastName, email } = req.body

  if (!name || !lastName || !email) {
    return res.status(400).json({ error: 'firstName, lastName, and email are required' })
  }

  const lead = await prisma.lead.create({
    data: {
      firstName: String(name),
      lastName: String(lastName),
      email: String(email),
    },
  })
  res.json(lead)
})

app.get('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const lead = await prisma.lead.findUnique({
    where: {
      id: Number(id),
    },
  })
  res.json(lead)
})

app.get('/leads', async (req: Request, res: Response) => {
  const leads = await prisma.lead.findMany()

  res.json(leads)
})

app.patch('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, email } = req.body
  const lead = await prisma.lead.update({
    where: {
      id: Number(id),
    },
    data: {
      firstName: String(name),
      email: String(email),
    },
  })
  res.json(lead)
})

app.delete('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  await prisma.lead.delete({
    where: {
      id: Number(id),
    },
  })
  res.json()
})

app.delete('/leads', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { ids } = req.body

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' })
  }

  try {
    const result = await prisma.lead.deleteMany({
      where: {
        id: {
          in: ids.map((id) => Number(id)),
        },
      },
    })

    res.json({ deletedCount: result.count })
  } catch (error) {
    console.error('Error deleting leads:', error)
    res.status(500).json({ error: 'Failed to delete leads' })
  }
})

app.post('/leads/generate-messages', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds, template } = req.body

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  if (!template || typeof template !== 'string') {
    return res.status(400).json({ error: 'template must be a non-empty string' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: {
        id: {
          in: leadIds.map((id) => Number(id)),
        },
      },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    let generatedCount = 0
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    for (const lead of leads) {
      try {
        const message = generateMessageFromTemplate(template, lead)

        await prisma.lead.update({
          where: { id: lead.id },
          data: { message },
        })

        generatedCount++
      } catch (error) {
        errors.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      generatedCount,
      errors,
    })
  } catch (error) {
    console.error('Error generating messages:', error)
    res.status(500).json({ error: 'Failed to generate messages' })
  }
})

app.post('/leads/bulk', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leads } = req.body

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'leads must be a non-empty array' })
  }

  try {
    const validLeads = leads.filter((lead) => {
      return (
        lead.firstName &&
        lead.lastName &&
        lead.email &&
        typeof lead.firstName === 'string' &&
        lead.firstName.trim() &&
        typeof lead.lastName === 'string' &&
        lead.lastName.trim() &&
        typeof lead.email === 'string' &&
        lead.email.trim()
      )
    })

    if (validLeads.length === 0) {
      return res
        .status(400)
        .json({ error: 'No valid leads found. firstName, lastName, and email are required.' })
    }

    const existingLeads = await prisma.lead.findMany({
      where: {
        OR: validLeads.map((lead) => ({
          AND: [{ firstName: lead.firstName.trim() }, { lastName: lead.lastName.trim() }],
        })),
      },
    })

    const leadKeys = new Set(
      existingLeads.map((lead) => `${lead.firstName.toLowerCase()}_${(lead.lastName || '').toLowerCase()}`)
    )

    const uniqueLeads = validLeads.filter((lead) => {
      const key = `${lead.firstName.toLowerCase()}_${lead.lastName.toLowerCase()}`
      return !leadKeys.has(key)
    })

    let importedCount = 0
    const errors: Array<{ lead: any; error: string }> = []

    for (const lead of uniqueLeads) {
      try {
        await prisma.lead.create({
          data: {
            firstName: lead.firstName.trim(),
            lastName: lead.lastName.trim(),
            email: lead.email.trim(),
            jobTitle: lead.jobTitle ? lead.jobTitle.trim() : null,
            countryCode: lead.countryCode ? lead.countryCode.trim() : null,
            companyName: lead.companyName ? lead.companyName.trim() : null,
          },
        })
        importedCount++
      } catch (error) {
        errors.push({
          lead: lead,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      importedCount,
      duplicatesSkipped: validLeads.length - uniqueLeads.length,
      invalidLeads: leads.length - validLeads.length,
      errors,
    })
  } catch (error) {
    console.error('Error importing leads:', error)
    res.status(500).json({ error: 'Failed to import leads' })
  }
})

app.post('/leads/verify-emails', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds } = req.body as { leadIds?: number[] }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds.map((id) => Number(id)) } },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    const connection = await Connection.connect({ address: TEMPORAL_ADDRESS })
    const client = new Client({ connection, namespace: 'default' })

    let verifiedCount = 0
    const results: Array<{ leadId: number; emailVerified: boolean }> = []
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    // Emit initial event
    io.emit('progress', { type: 'verifyEmail', total: leads.length, started: true })

    const limit = pLimit(5) // Limit concurrency to 5

    const promises = leads.map((lead) =>
      limit(async () => {
        try {
          const isVerified = await client.workflow.execute(verifyEmailWorkflow, {
            taskQueue: 'myQueue',
            workflowId: `verify-email-${lead.id}-${Date.now()}`,
            args: [lead.email],
          })

          await prisma.lead.update({
            where: { id: lead.id },
            data: { emailVerified: Boolean(isVerified) },
          })

          results.push({ leadId: lead.id, emailVerified: isVerified })
          verifiedCount += 1

          // Emit completed progress
          io.emit('progress', {
            type: 'verifyEmail',
            leadId: lead.id,
            status: 'completed',
          })
        } catch (error) {
          errors.push({
            leadId: lead.id,
            leadName: `${lead.firstName} ${lead.lastName}`.trim(),
            error: error instanceof Error ? error.message : 'Unknown error',
          })

          // Emit error progress
          io.emit('progress', {
            type: 'verifyEmail',
            leadId: lead.id,
            status: 'error',
          })
        }
      })
    )

    await Promise.all(promises)

    await connection.close()

    res.json({ success: true, verifiedCount, results, errors })
  } catch (error) {
    console.error('Error verifying emails:', error)
    res.status(500).json({ error: 'Failed to verify emails' })
  }
})

app.post('/leads/find-phones', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds, userTier } = req.body as { leadIds?: number[]; userTier?: number }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds.map((id) => Number(id)) } },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    const connection = await Connection.connect({ address: TEMPORAL_ADDRESS })
    const client = new Client({ connection, namespace: 'default' })

    let foundCount = 0
    const results: Array<{ leadId: number; phone: string | null; provider: string | null }> = []
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    // Emit an initial event
    io.emit('progress', { type: 'findPhone', total: leads.length, started: true })

    const limit = pLimit(5) // Limit concurrency to 5

    const promises = leads.map((lead) =>
      limit(async () => {
        try {
          const phoneResult = await client.workflow.execute(findPhoneWorkflow, {
            taskQueue: 'myQueue',
            workflowId: `find-phone-${lead.id}-${Date.now()}`,
            args: [
              {
                email: lead.email,
                fullName: `${lead.firstName} ${lead.lastName}`.trim(),
                companyWebsite: lead.companyName || undefined,
                jobTitle: lead.jobTitle || undefined,
                userTier: userTier ?? 0,
              },
            ],
          })

          if (phoneResult) {
            await prisma.lead.update({
              where: { id: lead.id },
              data: {
                phone: phoneResult.phone,
                phoneProvider: phoneResult.provider,
                phoneCountryCode: phoneResult.countryCode || null,
              },
            })

            results.push({ leadId: lead.id, phone: phoneResult.phone, provider: phoneResult.provider })
            foundCount += 1

            // Emit completed progress
            io.emit('progress', {
              type: 'findPhone',
              leadId: lead.id,
              status: 'completed',
            })
          } else {
            results.push({ leadId: lead.id, phone: null, provider: null })

            // Emit progress without result
            io.emit('progress', {
              type: 'findPhone',
              leadId: lead.id,
              status: 'completed',
            })
          }
        } catch (error) {
          errors.push({
            leadId: lead.id,
            leadName: `${lead.firstName} ${lead.lastName}`.trim(),
            error: error instanceof Error ? error.message : 'Unknown error',
          })

          // Emit error progress
          io.emit('progress', {
            type: 'findPhone',
            leadId: lead.id,
            status: 'error',
          })
        }
      })
    )

    await Promise.all(promises)

    await connection.close()

    res.json({ success: true, foundCount, results, errors })
  } catch (error) {
    console.error('Error finding phones:', error)
    res.status(500).json({ error: 'Failed to find phones' })
  }
})

server.listen(4000, () => {
  console.log('Express server is running on port 4000 with WebSockets')
})

runTemporalWorker().catch((err) => {
  console.error(err)
  process.exit(1)
})

function shutdown() {
  server.close(() => {
    console.log('Server closed gracefully')
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGUSR2', shutdown)
