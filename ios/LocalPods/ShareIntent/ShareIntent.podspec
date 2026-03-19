Pod::Spec.new do |s|
  s.name         = "ShareIntent"
  s.version      = "1.0.0"
  s.summary      = "Share intent handling for React Native"
  s.description  = "Handles share intents from other apps for OCR and AI features"
  s.homepage     = "https://github.com/cashbook/ShareIntent"
  s.license      = "MIT"
  s.author       = { "cashbook" => "dev@cashbook.app" }
  s.platform     = :ios, "13.0"
  s.source       = { :path => "." }
  s.source_files = "*.{h,m,swift}"
  s.dependency "React-Core"
  s.swift_versions = ["5.0"]
end
