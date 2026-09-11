# typed: false
# frozen_string_literal: true

class Oahu < Formula
  desc "Standalone Audible downloader and decrypter"
  homepage "https://github.com/DavidObando/Oahu"
  version "1.1.22"
  license "GPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-arm64.tar.gz"
      sha256 "07eda336033e37f2fe3285667f22cfaa02b42e96996fdc0355c88a0661a70ab5"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-x64.tar.gz"
      sha256 "1c20ba6292d2c0a58eee0a88d9801269cb9de4d91996177fb48d623fe5ee93fe"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-arm64.tar.gz"
      sha256 "527207c1fc47954b364ee837a6dd1ee36b488f6f2b13dc82fe2087664df52c79"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-x64.tar.gz"
      sha256 "c1e281327c9226d27f9db258fb5639288123fea7d6ad06d062d29345cb8550d4"
    end
  end

  def install
    libexec.install Dir["*"]
    chmod 0755, libexec/"Oahu"
    chmod 0755, libexec/"oahu-cli"
    bin.write_exec_script libexec/"Oahu"
    bin.write_exec_script libexec/"oahu-cli"
  end

  test do
    assert_predicate libexec/"Oahu", :executable?
    assert_predicate libexec/"oahu-cli", :executable?
  end
end
