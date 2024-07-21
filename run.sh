
#!/bin/bash
 
# Load NVM
#export NVM_DIR="$HOME/.nvm"
#[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
echo "Starting server at $(date)" >> /var/log/run_script.log
echo "Running nvm use 17" >> /var/log/run_script.log
# Use Node.js version 17
nvm use 17 >> /var/log/run_script.log
echo "Nvm updated" >> /var/log/run_script.log
# Navigate to the project directory
cd /root/Desktop/home/pankajdevesh.com/
echo "cd to project" >> /var/log/run_script.log
# Start the application with pnpm
pnpm start >> /var/log/run_script.log
echo "app exited" >> /var/log/run_script.log