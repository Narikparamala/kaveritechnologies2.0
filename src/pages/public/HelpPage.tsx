import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Download, CheckCircle, AlertCircle, HelpCircle } from 'lucide-react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { COMPANY } from '../../lib/company';

const steps = [
  {
    number: 1,
    title: 'Install VS Code',
    description: 'Download and install Visual Studio Code — the code editor you\'ll use for all your assignments.',
    details: (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          VS Code is a free code editor from Microsoft. It works on Windows, Mac, and Linux.
        </p>
        <a
          href="https://code.visualstudio.com/download"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <Download size={16} />
          Download VS Code
          <ExternalLink size={14} />
        </a>
      </div>
    ),
  },
  {
    number: 2,
    title: 'Download the Kaveri Extension',
    description: 'Get the Kaveri Coding extension file (.vsix) from GitHub.',
    details: (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Click the link below to download the extension file. It\'s only 19 KB — very small.
        </p>
        <a
          href="https://github.com/Narikparamala/kaveri-coding-workspace/releases/download/v0.10.0/kaveri-coding-0.10.0.vsix"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          <Download size={16} />
          Download Extension (.vsix)
          <ExternalLink size={14} />
        </a>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          Save the file somewhere you can find it — like your Downloads folder.
        </p>
      </div>
    ),
  },
  {
    number: 3,
    title: 'Install the Extension in VS Code',
    description: 'Add the downloaded extension to VS Code.',
    details: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
        <ol className="list-decimal list-inside space-y-2">
          <li>Open <strong className="text-slate-900 dark:text-white">VS Code</strong></li>
          <li>Press <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono">Ctrl+Shift+P</kbd> to open the Command Palette</li>
          <li>Type: <strong className="text-slate-900 dark:text-white">Extensions: Install from VSIX</strong></li>
          <li>Press Enter</li>
          <li>Navigate to the <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs">kaveri-coding-0.10.0.vsix</code> file you downloaded</li>
          <li>Select it — VS Code will install the extension</li>
        </ol>
        <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg mt-3">
          <CheckCircle size={16} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-300">
            You\'ll see a confirmation message when installation is complete.
          </p>
        </div>
      </div>
    ),
  },
  {
    number: 4,
    title: 'Sign In with Google',
    description: 'Connect the extension to your Kaveri Academy account.',
    details: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
        <ol className="list-decimal list-inside space-y-2">
          <li>Look at the <strong className="text-slate-900 dark:text-white">left sidebar</strong> — you\'ll see a new <strong>graduation cap icon (🎓)</strong></li>
          <li>Click the <strong className="text-slate-900 dark:text-white">graduation cap icon</strong></li>
          <li>In the sidebar, click <strong className="text-slate-900 dark:text-white">"Sign In with Google"</strong></li>
          <li>A browser window opens — sign in with your <strong className="text-slate-900 dark:text-white">Google account</strong></li>
          <li>After signing in, you\'ll be redirected back to VS Code</li>
        </ol>
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg mt-3">
          <AlertCircle size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Use the <strong>same Google account</strong> you registered with on Kaveri Academy.
          </p>
        </div>
      </div>
    ),
  },
  {
    number: 5,
    title: 'Join Your Batch',
    description: 'Enter the batch code your teacher gave you.',
    details: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
        <ol className="list-decimal list-inside space-y-2">
          <li>In the Kaveri Coding sidebar, click <strong className="text-slate-900 dark:text-white">"Join Batch"</strong></li>
          <li>Enter the <strong className="text-slate-900 dark:text-white">batch code</strong> your teacher gave you</li>
          <li>Click <strong className="text-slate-900 dark:text-white">Join</strong></li>
          <li>Your assignments will appear in the sidebar</li>
        </ol>
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg mt-3">
          <HelpCircle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Don\'t know your batch code? Ask your teacher or check your Kaveri Academy dashboard.
          </p>
        </div>
      </div>
    ),
  },
  {
    number: 6,
    title: 'Start Coding!',
    description: 'Open an assignment, write your code, run tests, and submit.',
    details: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
        <ol className="list-decimal list-inside space-y-2">
          <li>Click any assignment in <strong className="text-slate-900 dark:text-white">"My Assignments"</strong></li>
          <li>Read the problem in <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs">question.md</code></li>
          <li>Write your solution in <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs">main.py</code></li>
          <li>Click <strong className="text-slate-900 dark:text-white">"Run Tests"</strong> to check your answer</li>
          <li>Click <strong className="text-slate-900 dark:text-white">"Submit Answer"</strong> when ready</li>
        </ol>
        <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg mt-3">
          <CheckCircle size={16} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-300">
            Your code is automatically graded by the server. You can resubmit as many times as you want!
          </p>
        </div>
      </div>
    ),
  },
];

const quickRef = [
  { action: 'Open Kaveri sidebar', how: 'Click the 🎓 icon in the left activity bar' },
  { action: 'Sign In', how: 'Click "Sign In with Google" in the sidebar' },
  { action: 'Join Batch', how: 'Click "Join Batch" → enter batch code' },
  { action: 'Open Assignment', how: 'Click any assignment in "My Assignments"' },
  { action: 'Run Tests', how: 'Click 🧪 "Run Tests" or Ctrl+Shift+P → Kaveri: Run Tests' },
  { action: 'Submit Code', how: 'Click "Submit Answer" or Ctrl+Shift+P → Kaveri: Submit Answer' },
  { action: 'Check Results', how: 'Click "Refresh My Results"' },
];

const troubleshooting = [
  {
    q: '"Sign In" doesn\'t open a browser',
    a: 'Make sure you have a default browser set in Windows Settings. You can also try opening VS Code\'s built-in browser: Ctrl+Shift+P → "Simple Browser: Show".',
  },
  {
    q: '"Join Batch" says "Invalid batch code"',
    a: 'Ask your teacher for the correct batch code. Make sure you\'re signed in first.',
  },
  {
    q: 'Tests don\'t run',
    a: 'Make sure Python 3 is installed. Open a terminal in VS Code (Ctrl+`) and type "python --version" to check.',
  },
  {
    q: '"Submit Answer" fails',
    a: 'Make sure you\'re signed in (check the sidebar for your email). Make sure you have an internet connection.',
  },
  {
    q: 'Assignment folder didn\'t open',
    a: 'The folder is created at: C:\\Users\\<your-name>\\Documents\\Kaveri Coding\\<Assignment Name>\\. You can also click "Open Coding Folder" in the sidebar.',
  },
];

export default function HelpPage() {
  const [openStep, setOpenStep] = useState<number | null>(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-900/20 rounded-full text-primary-700 dark:text-primary-300 text-sm font-medium mb-4">
              <Download size={16} />
              Student Setup Guide
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
              Install the Kaveri Coding Extension
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg">
              Follow these 6 steps to start coding in VS Code. Takes about 2 minutes.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4 mb-16">
            {steps.map((step) => (
              <div
                key={step.number}
                className="card overflow-hidden"
              >
                <button
                  className="w-full text-left px-6 py-5 flex items-center gap-4 font-medium text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  onClick={() => setOpenStep(openStep === step.number ? null : step.number)}
                >
                  <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-bold">
                    {step.number}
                  </span>
                  <span className="flex-1">
                    <span className="block text-base">{step.title}</span>
                    <span className="block text-sm text-slate-500 dark:text-slate-400 font-normal mt-0.5">{step.description}</span>
                  </span>
                  {openStep === step.number ? (
                    <ChevronUp size={18} className="text-primary-600 flex-shrink-0" />
                  ) : (
                    <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />
                  )}
                </button>
                {openStep === step.number && (
                  <div className="px-6 pb-6 pt-0 animate-fade-in">
                    {step.details}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick Reference */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Quick Reference</h2>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left px-6 py-3 font-semibold text-slate-900 dark:text-white">Action</th>
                    <th className="text-left px-6 py-3 font-semibold text-slate-900 dark:text-white">How to do it</th>
                  </tr>
                </thead>
                <tbody>
                  {quickRef.map((item, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">{item.action}</td>
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400">{item.how}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Troubleshooting */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Troubleshooting</h2>
            <div className="space-y-3">
              {troubleshooting.map((item, i) => (
                <div key={i} className="card overflow-hidden">
                  <button
                    className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 font-medium text-slate-900 dark:text-white"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    <span className="text-sm">{item.q}</span>
                    {openFaq === i ? (
                      <ChevronUp size={16} className="text-primary-600 flex-shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
                    )}
                  </button>
                  {openFaq === i && (
                    <div className="px-6 pb-4 text-sm text-slate-600 dark:text-slate-400 animate-fade-in">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Support */}
          <div className="text-center p-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Need Help?</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4">
              Contact your teacher or reach out to us directly.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={`mailto:${COMPANY.email}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                📧 {COMPANY.email}
              </a>
              <a
                href="https://kaveri-academy.vercel.app/contact"
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
              >
                Contact Page
              </a>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
