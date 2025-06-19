#!/bin/bash

echo "🔧 Building SARJ Backend..."

# Install Rust if not available (for tiktoken compilation)
if ! command -v cargo &> /dev/null; then
    echo "📦 Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
fi

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install --upgrade pip

# Install tiktoken with pre-compiled binaries if possible
echo "🔧 Installing tiktoken..."
pip install --only-binary=all tiktoken==0.6.0 || pip install tiktoken==0.6.0

# Install other dependencies
echo "📦 Installing other dependencies..."
pip install -r requirements.txt

echo "✅ Build completed successfully!" 