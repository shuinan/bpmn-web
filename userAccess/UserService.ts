import { IUserService } from '../';

import { config } from "dotenv";
import mongoose from "mongoose";
import { User } from "./models/User";

export class UserService implements IUserService {
	static initialized = false;	
	constructor(server) {

		if (UserService.initialized)
			return;
		
		UserService.initialized = true;
		setImmediate(() => {
			this.init();
		});
    }
	async findUsers(query) {
		return await User.find(query);
	}
	async findUser(query) {
		return await User.findOne(query);
	}
	async addUser(userName, email, password, userGroups) {
		let exist = await User.findOne({ userName: userName });
		if (exist) {
			console.log(`user '${userName}' already exists`);
			return exist;
		}
		exist = await User.findOne({ email: email });
		if (exist) {
			console.log("user already exists with this email", email);
			return exist;
		}

		const user = new User({
			userName, email, password, userGroups
		});

		await user.save();
		return user;
	}
	async setPassword(userName, password) {

		let user = await User.findOne({ userName });
		if (!user) {
			console.log("User does not exist")
			return;
        }
		user.password = password;

		await user.save();

	}
	async install() {
		console.log(` adding new User for 'admin'  password: 'admin'`);
		//await this.init();
		await this.addUser('admin', 'admin@mySite.com', 'admin', ['ADMIN']);
    }

	init() {
		console.log('UserService.init()');
		config();
		console.log("MongoDB URL", process.env.MONGO_DB_URL)
		mongoose.set('strictQuery', false);
		mongoose.connect(process.env.MONGO_DB_URL);
		mongoose.connection.on('error', (err) => {
			console.error(err);
			console.log('%s MongoDB connection error. Please make sure MongoDB is running.');
			process.exit();
		});
	}

}
