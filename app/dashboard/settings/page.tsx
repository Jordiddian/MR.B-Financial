export default function SettingsPage() {
  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-white text-2xl font-semibold mb-1">Settings</h1>
      <p className="text-gray-400 text-sm mb-8">Budget and system configuration</p>

      <div className="space-y-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white text-sm font-semibold mb-4">Monthly budget</h2>
          <div className="space-y-3">
            {[
              { label: 'Total monthly cap ($)', placeholder: 'e.g. 1500' },
              { label: 'Max ad spend ($)', placeholder: 'e.g. 1200' },
              { label: 'Max API costs — text + image ($)', placeholder: 'e.g. 200' },
            ].map(({ label, placeholder }) => (
              <div key={label}>
                <label className="block text-gray-400 text-xs mb-1">{label}</label>
                <input
                  type="number"
                  placeholder={placeholder}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
            ))}
          </div>
          <button className="mt-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Save budget
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white text-sm font-semibold mb-1">Ad generation</h2>
          <p className="text-gray-500 text-xs mb-4">Controls how the automation pipeline runs</p>
          <div className="space-y-3 text-sm text-gray-400">
            <div className="flex justify-between items-center">
              <span>Creative type</span>
              <span className="text-white">Images only</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Text model</span>
              <span className="text-white">GPT-4o-mini</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Image model</span>
              <span className="text-white">OpenAI image API</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
