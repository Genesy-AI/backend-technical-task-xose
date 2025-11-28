import { LeadsList } from './components/LeadsList'
import { UserTierSelector } from './components/UserTierSelector'

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <a href="https://genesy.ai" target="_blank" className="flex items-center">
                <img
                  src="https://cdn.prod.website-files.com/674ec82ac8f13332ff5201aa/677eaa5351b3ef0c2418820a_favicon%20256x256.png"
                  className="h-8 w-8 transition-all duration-300 hover:drop-shadow-[0_0_2em_#646cffaa]"
                  alt="Genesy AI logo"
                />
                <h1 className="ml-3 text-xl font-semibold text-gray-900">TinyGenesy</h1>
              </a>
            </div>
            <div className="flex items-center gap-4">
              <UserTierSelector />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LeadsList />
      </main>
    </div>
  )
}

export default App
